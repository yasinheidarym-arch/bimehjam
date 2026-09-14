import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { aiPolicyService } from '../services/api';

type CategoryOption = { id: string; name: string };

type CatalogRow = {
  id: string;
  title: string;
  category: CategoryOption | null;
  configuredCategoryId: string | null;
  mappingSource: 'SETTING' | 'LEGACY_FALLBACK' | 'UNMAPPED' | 'INVALID_SETTING';
  requiresInsuranceCategory: boolean;
  enabled: boolean;
  isConfigurationValid: boolean;
  warning: string | null;
};

export function GoftinoAiResponsePolicyPanel() {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const applyRow = (updated: CatalogRow) => {
    setRows((current) => current.map((item) => item.id === updated.id ? updated : item));
    setSelectedCategories((current) => ({ ...current, [updated.id]: updated.configuredCategoryId || '' }));
  };

  const load = async () => {
    setLoading(true);
    try {
      const response: any = await aiPolicyService.getPolicies();
      const payload = response?.data || {};
      const policies = Array.isArray(payload) ? payload : payload.policies || [];
      setRows(policies);
      setCategories(Array.isArray(payload.categories) ? payload.categories : []);
      setSelectedCategories(Object.fromEntries(
        policies.map((row: CatalogRow) => [row.id, row.configuredCategoryId || '']),
      ));
    } catch (error: any) {
      setMessage(error.message || 'بارگذاری فهرست رشته‌های گفتینو ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const toggle = async (row: CatalogRow) => {
    setUpdatingId(row.id);
    setMessage(null);
    try {
      const enabled = !row.enabled;
      const selectedCategoryId = selectedCategories[row.id] || null;
      const response: any = await aiPolicyService.updatePolicy(row.id, {
        enabled,
        ...(enabled && selectedCategoryId ? { categoryId: selectedCategoryId } : {}),
      });
      applyRow(response.data);
      setMessage('وضعیت پاسخ‌گویی AI ذخیره شد.');
    } catch (error: any) {
      setMessage(error.message || 'ذخیره وضعیت ناموفق بود.');
    } finally {
      setUpdatingId(null);
    }
  };

  const saveCategory = async (row: CatalogRow) => {
    setUpdatingId(row.id);
    setMessage(null);
    try {
      const response: any = await aiPolicyService.updatePolicy(row.id, {
        categoryId: selectedCategories[row.id] || null,
      });
      applyRow(response.data);
      setMessage('اتصال رشته به دستهٔ بیمه‌ای ذخیره شد.');
    } catch (error: any) {
      setMessage(error.message || 'ذخیره اتصال دسته ناموفق بود.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section className="max-w-6xl space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-6">
      <div className="border-b border-slate-200 pb-3">
        <h4 className="text-sm font-extrabold text-slate-800">پاسخ‌گویی AI برای رشته‌های گفتینو</h4>
        <p className="mt-1 text-xs text-slate-500">
          هر رشته را با شناسهٔ پایدار به یک دستهٔ فعال متصل کنید. محتوای دانشی و قوانین AI از همان دسته خوانده می‌شوند.
        </p>
      </div>

      {message && <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-900">{message}</div>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[850px] text-right text-xs">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3">عنوان رشتهٔ گفتینو</th>
              <th className="p-3">دستهٔ بیمه‌ای مرتبط</th>
              <th className="p-3">اعتبار تنظیمات</th>
              <th className="p-3 text-center">AI پاسخ بدهد</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="p-6 text-center text-slate-500">در حال بارگذاری…</td></tr>
            ) : rows.map((row) => {
              const selectionChanged = (selectedCategories[row.id] || '') !== (row.configuredCategoryId || '');
              return (
                <tr key={row.id} className={`border-t align-top ${row.isConfigurationValid ? 'border-slate-100' : 'border-amber-200 bg-amber-50/40'}`}>
                  <td className="p-3">
                    <div className="font-bold text-slate-800">{row.title}</div>
                    <div className="mt-1 text-[10px] text-slate-400">شناسه پایدار: {row.id}</div>
                  </td>
                  <td className="p-3">
                    <div className="flex min-w-[300px] items-center gap-2">
                      <select
                        value={selectedCategories[row.id] || ''}
                        onChange={(event) => setSelectedCategories((current) => ({ ...current, [row.id]: event.target.value }))}
                        disabled={updatingId === row.id}
                        aria-label={`دستهٔ بیمه‌ای مرتبط با ${row.title}`}
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs outline-none focus:border-indigo-500 disabled:opacity-60"
                      >
                        <option value="">بدون دستهٔ تخصصی</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void saveCategory(row)}
                        disabled={updatingId === row.id || !selectionChanged}
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Save className="h-3.5 w-3.5" /> ذخیره
                      </button>
                    </div>
                    {row.mappingSource === 'LEGACY_FALLBACK' && row.category && (
                      <p className="mt-1 text-[10px] text-amber-700">
                        اتصال قبلی فقط از تطبیق نام تشخیص داده شده است؛ برای قطعی‌شدن، دسته را انتخاب و ذخیره کنید.
                      </p>
                    )}
                  </td>
                  <td className="p-3">
                    {row.isConfigurationValid ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 font-bold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> معتبر
                      </span>
                    ) : (
                      <div className="max-w-[260px] text-amber-800">
                        <span className="inline-flex items-center gap-1 font-bold">
                          <AlertTriangle className="h-4 w-4" /> تنظیمات ناقص
                        </span>
                        <p className="mt-1 leading-5">{row.warning}</p>
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      type="button"
                      disabled={updatingId === row.id}
                      onClick={() => void toggle(row)}
                      aria-label={`پاسخ AI برای ${row.title}`}
                      aria-pressed={row.enabled}
                      className="inline-flex items-center gap-2 font-bold disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {row.enabled ? <ToggleRight className="h-7 w-7 text-emerald-600" /> : <ToggleLeft className="h-7 w-7 text-slate-400" />}
                      <span>{row.enabled ? 'روشن' : 'خاموش'}</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
