import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { aiPolicyService, knowledgeService } from '../services/api';

type InsuranceCategory = { id: string; name: string; status: string };
type Policy = {
  id: string;
  goftinoTopicId: string;
  goftinoTopicTitle: string;
  insuranceCategoryId: string;
  insuranceCategory: { id: string; name: string; status: string };
  mode: 'AI_ALLOWED' | 'HUMAN_ONLY';
  active: boolean;
  fallbackMessage?: string | null;
};

const emptyForm = {
  goftinoTopicId: '',
  goftinoTopicTitle: '',
  insuranceCategoryId: '',
  mode: 'AI_ALLOWED' as const,
  active: true,
  fallbackMessage: '',
};

export function GoftinoAiResponsePolicyPanel() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [categories, setCategories] = useState<InsuranceCategory[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [policyResponse, categoryResponse]: any[] = await Promise.all([
        aiPolicyService.getPolicies(),
        knowledgeService.getInsuranceCategories(),
      ]);
      setPolicies(policyResponse?.data || []);
      setCategories((categoryResponse?.data || []).filter((category: InsuranceCategory) => category.status === 'ACTIVE'));
    } catch (error: any) {
      setMessage(error.message || 'بارگذاری قوانین گفتینو ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (editingId) await aiPolicyService.updatePolicy(editingId, form);
      else await aiPolicyService.createPolicy(form);
      setMessage(editingId ? 'قانون گفتینو به‌روزرسانی شد.' : 'قانون گفتینو ایجاد شد.');
      resetForm();
      await load();
    } catch (error: any) {
      setMessage(error.message || 'ذخیره قانون ناموفق بود.');
    } finally {
      setSaving(false);
    }
  };

  const edit = (policy: Policy) => {
    setEditingId(policy.id);
    setForm({
      goftinoTopicId: policy.goftinoTopicId,
      goftinoTopicTitle: policy.goftinoTopicTitle,
      insuranceCategoryId: policy.insuranceCategoryId,
      mode: policy.mode,
      active: policy.active,
      fallbackMessage: policy.fallbackMessage || '',
    });
  };

  const update = async (id: string, changes: Partial<Policy>) => {
    setSaving(true);
    try {
      await aiPolicyService.updatePolicy(id, changes);
      await load();
    } catch (error: any) {
      setMessage(error.message || 'به‌روزرسانی قانون ناموفق بود.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (policy: Policy) => {
    if (!window.confirm(`قانون «${policy.goftinoTopicTitle}» حذف شود؟`)) return;
    setSaving(true);
    try {
      await aiPolicyService.deletePolicy(policy.id);
      setMessage('قانون گفتینو حذف شد.');
      await load();
    } catch (error: any) {
      setMessage(error.message || 'حذف قانون ناموفق بود.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-5 max-w-5xl">
      <div className="flex items-start gap-2 border-b border-slate-200 pb-3">
        <div>
          <h4 className="font-extrabold text-slate-800 text-sm">قوانین پاسخ‌گویی هوش مصنوعی بر اساس دسته</h4>
          <p className="text-xs text-slate-500 mt-1">
            دسترسی AI فقط برای شناسه‌های پایدار ثبت‌شدهٔ گفتینو فعال است؛ رشتهٔ ناشناس به کارشناس ارجاع می‌شود.
          </p>
        </div>
      </div>

      {message && <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-900">{message}</div>}

      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-xs font-bold text-slate-700">شناسهٔ پایدار رشته/دپارتمان گفتینو
          <input required value={form.goftinoTopicId} onChange={(event) => setForm({ ...form, goftinoTopicId: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dir-ltr text-left" placeholder="مثال: department_123" />
        </label>
        <label className="text-xs font-bold text-slate-700">عنوان نمایشی رشتهٔ گفتینو
          <input required value={form.goftinoTopicTitle} onChange={(event) => setForm({ ...form, goftinoTopicTitle: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="مثال: بیمه مسئولیت" />
        </label>
        <label className="text-xs font-bold text-slate-700">دستهٔ بیمهٔ مقصد
          <select required value={form.insuranceCategoryId} onChange={(event) => setForm({ ...form, insuranceCategoryId: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">انتخاب دسته</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-700">حالت پاسخ‌گویی
          <select value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value as 'AI_ALLOWED' | 'HUMAN_ONLY' })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="AI_ALLOWED">AI پاسخ دهد</option>
            <option value="HUMAN_ONLY">ارجاع به کارشناس</option>
          </select>
        </label>
        <label className="md:col-span-2 text-xs font-bold text-slate-700">پیام ارجاع (اختیاری)
          <input value={form.fallbackMessage} onChange={(event) => setForm({ ...form, fallbackMessage: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="برای بررسی دقیق، همکاران ما پاسخ می‌دهند." />
        </label>
        <div className="md:col-span-2 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> قانون فعال باشد</label>
          <div className="flex gap-2"><button type="button" onClick={resetForm} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600">انصراف</button><button disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"><Plus className="h-3.5 w-3.5" />{editingId ? 'ذخیره ویرایش' : 'افزودن قانون'}</button></div>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-right text-xs">
          <thead className="bg-slate-100 text-slate-600"><tr><th className="p-3">عنوان رشتهٔ گفتینو</th><th className="p-3">دستهٔ بیمهٔ مقصد</th><th className="p-3">وضعیت</th><th className="p-3">حالت پاسخ‌گویی</th><th className="p-3">عملیات</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={5} className="p-5 text-center text-slate-500">در حال بارگذاری…</td></tr> : policies.length === 0 ? <tr><td colSpan={5} className="p-5 text-center text-slate-500">هنوز قانونی ثبت نشده است؛ وضعیت امن پیش‌فرض، ارجاع به کارشناس است.</td></tr> : policies.map((policy) => <tr key={policy.id} className="border-t border-slate-100"><td className="p-3"><div className="font-bold text-slate-800">{policy.goftinoTopicTitle}</div><div className="mt-1 font-mono text-[10px] text-slate-500 dir-ltr text-left">{policy.goftinoTopicId}</div></td><td className="p-3 font-bold text-slate-700">{policy.insuranceCategory?.name}</td><td className="p-3"><button disabled={saving} onClick={() => void update(policy.id, { active: !policy.active })} className="inline-flex items-center gap-1 font-bold"><>{policy.active ? <ToggleRight className="h-5 w-5 text-emerald-600" /> : <ToggleLeft className="h-5 w-5 text-slate-400" />}</>{policy.active ? 'فعال' : 'غیرفعال'}</button></td><td className="p-3"><span className={policy.mode === 'AI_ALLOWED' ? 'font-bold text-emerald-700' : 'font-bold text-amber-700'}>{policy.mode === 'AI_ALLOWED' ? 'AI پاسخ دهد' : 'ارجاع به کارشناس'}</span></td><td className="p-3"><div className="flex gap-2"><button onClick={() => edit(policy)} className="text-indigo-600" title="ویرایش"><Pencil className="h-4 w-4" /></button><button onClick={() => void remove(policy)} className="text-rose-600" title="حذف"><Trash2 className="h-4 w-4" /></button></div></td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
