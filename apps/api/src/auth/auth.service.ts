import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import { join } from 'path';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private readonly maxLoginAttempts = 5;
  private readonly lockoutMinutes = 15;

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
      include: { location: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (!user.passwordHash?.trim()) {
      console.warn('[AuthService] User has no password hash:', user.email);
      throw new UnauthorizedException('Invalid credentials');
    }

    const now = new Date();
    if (user.lockedUntil && now < user.lockedUntil) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000);
      throw new HttpException(
        `Cuenta bloqueada temporalmente por intentos fallidos. Intente nuevamente en ${minutesLeft} min.`,
        HttpStatus.LOCKED,
      );
    }

    let isPasswordValid = false;
    try {
      isPasswordValid = await bcrypt.compare(
        loginDto.password,
        user.passwordHash,
      );
    } catch (err) {
      console.error('[AuthService] bcrypt.compare failed for', user.email, err);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!isPasswordValid) {
      const newAttempts = (user.failedLoginAttempts ?? 0) + 1;
      const data: { failedLoginAttempts: number; lockedUntil?: Date } = {
        failedLoginAttempts: newAttempts,
      };
      if (newAttempts >= this.maxLoginAttempts) {
        data.lockedUntil = new Date(now.getTime() + this.lockoutMinutes * 60 * 1000);
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data,
      });
      if (newAttempts >= this.maxLoginAttempts) {
        throw new HttpException(
          `Cuenta bloqueada por ${this.lockoutMinutes} minutos tras ${this.maxLoginAttempts} intentos fallidos.`,
          HttpStatus.LOCKED,
        );
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login and reset lockout
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLogin: now,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        location: user.location,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(registerDto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        passwordHash,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        role: registerDto.role,
        locationId: registerDto.locationId,
      },
      include: { location: true },
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      location: user.location,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { location: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      location: user.location,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
    };
  }

  async verifyFace(userId: string, capturedImageBuffer: Buffer): Promise<{ verified: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    if (!user?.avatarUrl) {
      throw new BadRequestException('El usuario no tiene foto de verificación registrada');
    }
    const storedPath = join(process.cwd(), user.avatarUrl.replace(/^\//, ''));
    if (!fs.existsSync(storedPath)) {
      throw new BadRequestException('No se encontró la foto de referencia');
    }
    const storedBuffer = fs.readFileSync(storedPath);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException('Verificación por IA no configurada (OPENAI_API_KEY)');
    }
    const openai = new OpenAI({ apiKey });
    const storedB64 = storedBuffer.toString('base64');
    const capturedB64 = capturedImageBuffer.toString('base64');
    const ext = (user.avatarUrl.split('.').pop() || '').toLowerCase();
    const storedMime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 50,
      messages: [
        {
          role: 'system',
          content: 'You are a face verification assistant. You receive two images: one is the reference photo of a person, the other is a photo just taken. Your only job is to determine if both images show THE SAME PERSON. Consider same person even with different lighting, angle, or expression. Answer with exactly one word: YES or NO.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Image 1: reference photo of the person.' },
            {
              type: 'image_url',
              image_url: { url: `data:${storedMime};base64,${storedB64}`, detail: 'high' },
            },
            { type: 'text', text: 'Image 2: photo just taken for verification.' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/jpeg;base64,' + capturedB64, detail: 'high' },
            },
            { type: 'text', text: 'Do both images show the same person? Answer only YES or NO.' },
          ],
        },
      ],
    });
    const answer = (response.choices[0]?.message?.content || '').trim().toUpperCase();
    const verified = answer.startsWith('YES');
    return { verified };
  }
}
