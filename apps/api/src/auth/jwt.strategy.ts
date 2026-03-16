import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'nova-dev-secret-key',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        location: true,
        userLocations: { include: { location: true } },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or deactivated');
    }

    const assignedLocations =
      (user as any).userLocations?.map((ul: any) => ul.location).filter(Boolean) ?? [];
    if (
      user.location &&
      !assignedLocations.some((l: any) => l?.id === user.locationId)
    ) {
      assignedLocations.push(user.location);
    }
    const defaultLocation = user.location ?? assignedLocations[0] ?? null;

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      locationId: user.locationId,
      location: defaultLocation,
      locations: assignedLocations,
    };
  }
}
