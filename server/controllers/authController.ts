import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db/client';
import { AuthRequest } from '../middleware/auth';
import { normalizeIranianMobile } from '../services/fastNotifySmsService';

const JWT_SECRET = process.env.JWT_SECRET || 'bimehjam_jwt_secret_key_2026';

export async function login(req: Request, res: Response) {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'نام و نام خانوادگی، ایمیل و کلمه عبور الزامی است.',
      });
    }

    const fullName = String(name).trim();

    if (fullName.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'نام و نام خانوادگی را کامل وارد کنید.',
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'ایمیل یا کلمه عبور اشتباه است.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'ایمیل یا کلمه عبور اشتباه است.',
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { name: fullName },
    });

    const token = jwt.sign(
      {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        name: updatedUser.name,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      message: 'ورود موفقیت‌آمیز بود',
      token,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        avatar: updatedUser.avatar,
        createdAt: updatedUser.createdAt,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
export async function register(req: Request, res: Response) {
  try {
    const { email, password, name, role, mobile } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'نام، ایمیل و رمز عبور الزامی است.',
      });
    }

    const existing = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'کاربری با این ایمیل قبلاً ثبت نام شده است.',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const normalizedRole = role || 'OPERATOR';
    const normalizedMobile = mobile ? normalizeIranianMobile(mobile) : null;
    if (mobile && !normalizedMobile) {
      return res.status(400).json({ success: false, error: 'شماره موبایل معتبر نیست.' });
    }
    const newUser = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        password: hashedPassword,
        name,
        role: normalizedRole,
        mobile: ['ADMIN', 'OPERATOR'].includes(normalizedRole) ? normalizedMobile : null,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'حساب کاربری اپراتور جدید با موفقیت ایجاد شد',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        avatar: newUser.avatar,
        mobile: newUser.mobile,
        createdAt: newUser.createdAt,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function getMe(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'احراز هویت نشده‌اید' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        mobile: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'کاربر یافت نشد' });
    }

    return res.json({
      success: true,
      user,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function listUsers(req: AuthRequest, res: Response) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        mobile: true,
        createdAt: true,
        _count: {
          select: { conversations: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}


export async function updateUser(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { name, email, role, password, mobile } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!existingUser) return res.status(404).json({ success: false, error: 'کاربر یافت نشد.' });
    const targetRole = role || existingUser.role;
    const normalizedMobile = mobile ? normalizeIranianMobile(mobile) : null;
    if (mobile && !normalizedMobile) {
      return res.status(400).json({ success: false, error: 'شماره موبایل معتبر نیست.' });
    }

    const data: any = {
      ...(name && { name }),
      ...(email && { email: email.trim().toLowerCase() }),
      ...(role && { role }),
      ...(mobile !== undefined && {
        mobile: ['ADMIN', 'OPERATOR'].includes(targetRole) ? normalizedMobile : null,
      }),
      ...(!['ADMIN', 'OPERATOR'].includes(targetRole) && { mobile: null }),
    };

    if (password) {
      if (String(password).length < 6) {
        return res.status(400).json({
          success: false,
          error: 'رمز عبور باید حداقل ۶ کاراکتر باشد.',
        });
      }

      data.password = await bcrypt.hash(String(password), 10);
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        mobile: true,
        createdAt: true,
      },
    });

    return res.json({
      success: true,
      user,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}


export async function deleteUser(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;

    if (req.user?.id === id) {
      return res.status(400).json({
        success: false,
        error: 'امکان حذف حساب کاربری خودتان وجود ندارد.',
      });
    }

    await prisma.user.delete({
      where: { id },
    });

    return res.json({
      success: true,
      message: 'کاربر حذف شد.',
    });

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
