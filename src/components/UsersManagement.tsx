import React, { useEffect, useState } from 'react';
import { Plus, Users, X, Loader2, UserPlus, Pencil, Trash2 } from 'lucide-react';

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  mobile?: string | null;
  avatar?: string | null;
  createdAt?: string;
  _count?: {
    conversations?: number;
  };
};

const emptyForm = {
  name: '',
  email: '',
  password: '',
  role: 'OPERATOR',
  mobile: '',
};

export default function UsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [form, setForm] = useState(emptyForm);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const currentUserId = (() => {
    try {
      const stored = localStorage.getItem('bimeh_jam_user');
      return stored ? JSON.parse(stored)?.id : null;
    } catch {
      return null;
    }
  })();

  const getToken = () => localStorage.getItem('bimeh_jam_token');

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');

      const res = await fetch('/api/auth/users', {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'دریافت کاربران ناموفق بود.');
      }

      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message || 'خطا در دریافت کاربران.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openCreateForm = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setError('');
    setSuccess('');
    setShowForm(true);
  };

  const openEditForm = (user: User) => {
    setEditingUser(user);
    setForm({
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'OPERATOR',
      mobile: user.mobile || '',
    });
    setError('');
    setSuccess('');
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;

    setShowForm(false);
    setEditingUser(null);
    setForm(emptyForm);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError('');
    setSuccess('');

    if (!form.name.trim() || !form.email.trim()) {
      setError('نام و ایمیل الزامی است.');
      return;
    }

    if (!editingUser && !form.password) {
      setError('رمز عبور برای کاربر جدید الزامی است.');
      return;
    }

    if (form.password && form.password.length < 6) {
      setError('رمز عبور باید حداقل ۶ کاراکتر باشد.');
      return;
    }

    try {
      setSaving(true);

      const body: any = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        mobile: form.mobile.trim(),
      };

      if (form.password) {
        body.password = form.password;
      }

      const url = editingUser
        ? `/api/auth/users/${editingUser.id}`
        : '/api/auth/register';

      const method = editingUser ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'عملیات ناموفق بود.');
      }

      setSuccess(
        editingUser
          ? 'اطلاعات کاربر با موفقیت به‌روزرسانی شد.'
          : 'کاربر جدید با موفقیت ایجاد شد.'
      );

      setShowForm(false);
      setEditingUser(null);
      setForm(emptyForm);

      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'خطا در انجام عملیات.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: User) => {
    if (user.id === currentUserId) {
      setError('نمی‌توانید حساب کاربری خودتان را حذف کنید.');
      return;
    }

    const confirmed = window.confirm(
      `آیا از حذف کاربر «${user.name}» مطمئن هستید؟`
    );

    if (!confirmed) return;

    try {
      setError('');
      setSuccess('');
      setSaving(true);

      const res = await fetch(`/api/auth/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'حذف کاربر ناموفق بود.');
      }

      setSuccess('کاربر با موفقیت حذف شد.');
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'خطا در حذف کاربر.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-5 max-w-3xl">

      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>

          <div>
            <h4 className="font-extrabold text-slate-800 text-sm">
              مدیریت کاربران سیستم
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              مشاهده و مدیریت کاربران دارای دسترسی به سامانه
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreateForm}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          افزودن کاربر
        </button>
      </div>

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
          {success}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-blue-100 rounded-2xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {editingUser ? (
                <Pencil className="w-4 h-4 text-blue-600" />
              ) : (
                <UserPlus className="w-4 h-4 text-blue-600" />
              )}

              <h5 className="font-extrabold text-sm text-slate-800">
                {editingUser ? 'ویرایش کاربر' : 'افزودن کاربر جدید'}
              </h5>
            </div>

            <button
              type="button"
              onClick={closeForm}
              disabled={saving}
              className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                نام و نام خانوادگی
              </label>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
                placeholder="مثلاً علی رضایی"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                ایمیل
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm({ ...form, email: e.target.value })
                }
                placeholder="user@bimehjam.ir"
                dir="ltr"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                {editingUser ? 'رمز عبور جدید (اختیاری)' : 'رمز عبور'}
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
                placeholder={
                  editingUser
                    ? 'در صورت نیاز به تغییر وارد کنید'
                    : 'حداقل ۶ کاراکتر'
                }
                dir="ltr"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                نقش کاربر
              </label>

              <select
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value })
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 bg-white"
              >
                <option value="OPERATOR">اپراتور</option>
                <option value="ADMIN">مدیر</option>
              </select>
            </div>

            {['ADMIN', 'OPERATOR'].includes(form.role) && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  شماره موبایل
                </label>
                <input
                  type="tel"
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                  placeholder="09xxxxxxxxx"
                  dir="ltr"
                  inputMode="numeric"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
            )}

          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={closeForm}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              انصراف
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving
                ? 'در حال ذخیره...'
                : editingUser
                  ? 'ذخیره تغییرات'
                  : 'ایجاد کاربر'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-sm text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin ml-2" />
          در حال دریافت کاربران...
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-500">
          کاربری برای نمایش وجود ندارد.
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="font-bold text-sm text-slate-800">
                  {user.name}
                </div>

                <div
                  dir="ltr"
                  className="text-xs text-slate-500 text-right mt-1 truncate"
                >
                  {user.email}
                </div>
                {user.mobile && (
                  <div dir="ltr" className="text-xs text-slate-500 text-right mt-1">
                    {user.mobile}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-full ${
                    user.role === 'ADMIN'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {user.role === 'ADMIN' ? 'مدیر' : 'اپراتور'}
                </span>

                <button
                  type="button"
                  onClick={() => openEditForm(user)}
                  className="w-9 h-9 rounded-lg border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 flex items-center justify-center transition-colors"
                  title="ویرایش کاربر"
                >
                  <Pencil className="w-4 h-4" />
                </button>

                {user.id !== currentUserId && (
                  <button
                    type="button"
                    onClick={() => handleDelete(user)}
                    disabled={saving}
                    className="w-9 h-9 rounded-lg border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 flex items-center justify-center transition-colors"
                    title="حذف کاربر"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-[11px] text-slate-400 border-t border-slate-200 pt-3">
        تعداد کاربران: {users.length}
      </div>

    </div>
  );
}
