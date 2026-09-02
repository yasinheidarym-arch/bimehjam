import { useEffect, useState } from 'react';
import { LockKeyhole, ToggleLeft, ToggleRight } from 'lucide-react';
import { aiPolicyService } from '../services/api';

type CatalogRow = {
  id: string;
  title: string;
  category: { id: string; name: string } | null;
  enabled: boolean;
  locked: boolean;
};

export function GoftinoAiResponsePolicyPanel() {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response: any = await aiPolicyService.getPolicies();
      setRows(response?.data || []);
    } catch (error: any) {
      setMessage(error.message || 'بارگذاری فهرست رشته‌های گفتینو ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const toggle = async (row: CatalogRow) => {
    if (row.locked) return;
    setUpdatingId(row.id);
    setMessage(null);
    try {
      await aiPolicyService.updatePolicy(row.id, { enabled: !row.enabled });
      setRows((current) => current.map((item) =>
        item.id === row.id ? { ...item, enabled: !item.enabled } : item,
      ));
      setMessage('وضعیت پاسخ‌گویی AI ذخیره شد.');
    } catch (error: any) {
      setMessage(error.message || 'ذخیره وضعیت ناموفق بود.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section className="max-w-5xl space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-6">
      <div className="border-b border-slate-200 pb-3">
        <h4 className="text-sm font-extrabold text-slate-800">پاسخ‌گویی AI برای رشته‌های گفتینو</h4>
        <p className="mt-1 text-xs text-slate-500">
          دستهٔ بیمه‌ای هر رشته از قبل تعیین شده است. فقط مشخص کنید AI برای آن رشته پاسخ بدهد یا گفتگو به کارشناس ارجاع شود.
        </p>
      </div>

      {message && <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-900">{message}</div>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[650px] text-right text-xs">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3">عنوان رشتهٔ گفتینو</th>
              <th className="p-3">دستهٔ بیمه‌ای مرتبط</th>
              <th className="p-3 text-center">AI پاسخ بدهد</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="p-6 text-center text-slate-500">در حال بارگذاری…</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="p-3 font-bold text-slate-800">{row.title}</td>
                <td className="p-3">
                  {row.category ? (
                    <span className="font-bold text-slate-700">{row.category.name}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-bold text-amber-700"><LockKeyhole className="h-3.5 w-3.5" />ارجاع ثابت به کارشناس</span>
                  )}
                </td>
                <td className="p-3 text-center">
                  <button
                    type="button"
                    disabled={row.locked || updatingId === row.id}
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
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
