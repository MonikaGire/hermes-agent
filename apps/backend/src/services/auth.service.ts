import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '@hermes/database';
import { AppError } from '../utils/AppError.js';
import type { LoginDto, RegisterDto, AuthResponse, JwtPayload } from '../types/auth.types.js';

export class AuthService {
  private readonly saltRounds = 12;

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new AppError('Email already registered', 409);

    const passwordHash = await bcrypt.hash(dto.password, this.saltRounds);

    const user = await prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        passwordHash,
        role: (dto.role?.toUpperCase() ?? 'USER') as 'ADMIN' | 'USER',
      },
      select: { id: true, name: true, email: true, role: true },
    });

    const token = this.signToken({ sub: user.id, email: user.email, role: user.role });
    return { token, user };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true, name: true, email: true, role: true, passwordHash: true, isActive: true },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new AppError('Invalid email or password', 401);
    }

    if (!user.isActive) throw new AppError('Account is disabled', 403);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = this.signToken({ sub: user.id, email: user.email, role: user.role });
    const { passwordHash: _, ...safeUser } = user;
    return { token, user: safeUser };
  }

  async getById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
    });
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  async refresh(token: string): Promise<{ token: string }> {
    if (!token) throw new AppError('Token is required', 400);
    const secret = process.env['JWT_SECRET']!;

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, secret, { ignoreExpiration: true }) as JwtPayload;
    } catch {
      throw new AppError('Invalid token', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) throw new AppError('User not found or inactive', 401);

    const newToken = this.signToken({ sub: user.id, email: user.email, role: user.role });
    return { token: newToken };
  }

  private signToken(payload: { sub: string; email: string; role: string }): string {
    const secret = process.env['JWT_SECRET']!;
    const expiresIn = process.env['JWT_EXPIRES_IN'] ?? '7d';
    return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
  }
}
