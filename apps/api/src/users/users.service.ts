import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { Prisma } from '../../generated/prisma';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryUsersDto) {
    const { search, role, locationId, isActive, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};
    const and: Prisma.UserWhereInput[] = [];

    if (search) {
      and.push({
        OR: [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { email: { contains: search } },
        ],
      });
    }

    if (role) {
      where.role = role;
    }

    if (locationId) {
      and.push({
        OR: [
          { locationId },
          { userLocations: { some: { locationId } } },
        ],
      });
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (and.length > 0) {
      where.AND = and;
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          location: true,
          userLocations: { include: { location: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const dataWithLocations = data.map((u) => {
      const assigned =
        (u as any).userLocations?.map((ul: any) => ul.location).filter(Boolean) ?? [];
      if (u.location && !assigned.some((l: any) => l?.id === u.locationId)) {
        assigned.push(u.location);
      }
      const { userLocations, ...rest } = u as any;
      return { ...rest, locations: assigned };
    });

    return {
      data: dataWithLocations,
      total,
      page,
      limit,
    };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        location: true,
        userLocations: { include: { location: true } },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    const assigned =
      (user as any).userLocations?.map((ul: any) => ul.location).filter(Boolean) ?? [];
    if (user.location && !assigned.some((l: any) => l?.id === user.locationId)) {
      assigned.push(user.location);
    }
    const { userLocations, ...rest } = user as any;
    return { ...rest, locations: assigned };
  }

  async create(createUserDto: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(createUserDto.password, 10);
    const locationIds = createUserDto.locationIds?.length
      ? createUserDto.locationIds
      : createUserDto.locationId
        ? [createUserDto.locationId]
        : [];
    const defaultLocationId = locationIds[0] ?? createUserDto.locationId ?? null;

    const user = await this.prisma.user.create({
      data: {
        email: createUserDto.email,
        passwordHash,
        firstName: createUserDto.firstName,
        lastName: createUserDto.lastName,
        phone: createUserDto.phone,
        avatarUrl: createUserDto.avatarUrl,
        role: createUserDto.role,
        locationId: defaultLocationId,
        isActive: createUserDto.isActive ?? true,
      },
      include: {
        location: true,
        userLocations: { include: { location: true } },
      },
    });

    if (locationIds.length > 0) {
      await this.prisma.userLocation.createMany({
        data: locationIds.map((locationId) => ({
          userId: user.id,
          locationId,
        })),
        skipDuplicates: true,
      });
      const updated = await this.prisma.user.findUnique({
        where: { id: user.id },
        include: {
          location: true,
          userLocations: { include: { location: true } },
        },
      });
      const assigned =
        (updated as any).userLocations?.map((ul: any) => ul.location).filter(Boolean) ?? [];
      if (updated!.location && !assigned.some((l: any) => l?.id === updated!.locationId)) {
        assigned.push(updated!.location);
      }
      const { userLocations, ...rest } = updated as any;
      return { ...rest, locations: assigned };
    }

    return { ...user, locations: user.location ? [user.location] : [] };
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    await this.findById(id);

    // Check email uniqueness if updating email
    if (updateUserDto.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
      });

      if (existingUser && existingUser.id !== id) {
        throw new ConflictException('Email already registered');
      }
    }

    const data: Record<string, unknown> = {};

    if (updateUserDto.email !== undefined) data.email = updateUserDto.email;
    if (updateUserDto.firstName !== undefined)
      data.firstName = updateUserDto.firstName;
    if (updateUserDto.lastName !== undefined)
      data.lastName = updateUserDto.lastName;
    if (updateUserDto.phone !== undefined) data.phone = updateUserDto.phone;
    if (updateUserDto.avatarUrl !== undefined)
      data.avatarUrl = updateUserDto.avatarUrl;
    if (updateUserDto.role !== undefined) data.role = updateUserDto.role;
    if (updateUserDto.locationId !== undefined)
      data.locationId =
        updateUserDto.locationId === '' || updateUserDto.locationId === null
          ? null
          : updateUserDto.locationId;
    if (updateUserDto.isActive !== undefined)
      data.isActive = updateUserDto.isActive;

    if (updateUserDto.locationIds !== undefined) {
      await this.prisma.userLocation.deleteMany({ where: { userId: id } });
      const locationIds = updateUserDto.locationIds.filter(Boolean);
      if (locationIds.length > 0) {
        await this.prisma.userLocation.createMany({
          data: locationIds.map((locationId) => ({ userId: id, locationId })),
          skipDuplicates: true,
        });
      }
      data.locationId = locationIds[0] ?? null;
    }

    if (updateUserDto.password) {
      data.passwordHash = await bcrypt.hash(updateUserDto.password, 10);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
      include: {
        location: true,
        userLocations: { include: { location: true } },
      },
    });

    const assigned =
      (user as any).userLocations?.map((ul: any) => ul.location).filter(Boolean) ?? [];
    if (user.location && !assigned.some((l: any) => l?.id === user.locationId)) {
      assigned.push(user.location);
    }
    const { userLocations, ...rest } = user as any;
    return { ...rest, locations: assigned };
  }

  async deactivate(id: string) {
    await this.findById(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });

    return user;
  }
}
