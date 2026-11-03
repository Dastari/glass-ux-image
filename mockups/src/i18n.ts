/* Just enough Arabic to judge the mirrored layout. The real suite uses glass-ux message packs. */
const ar: Record<string, string> = {
  File: "ملف", Edit: "تحرير", Image: "صورة", Layer: "طبقة", Select: "تحديد", Filter: "مرشّح", View: "عرض", Window: "نافذة", Help: "مساعدة",
  Histogram: "المدرّج التكراري", Colour: "اللون", Layers: "الطبقات", History: "السجل", Export: "تصدير", Size: "الحجم", Hardness: "الصلابة", Opacity: "العتامة", Flow: "التدفق", Smoothing: "التنعيم", Mode: "الوضع",
  Normal: "عادي", Screen: "تفتيح", Multiply: "ضرب", "Lock": "قفل",
  Grade: "تدرّج لوني", Curves: "المنحنيات", "Colour balance": "توازن اللون", "Sun glow": "وهج الشمس", Title: "عنوان", Retouch: "تنقيح", Background: "الخلفية",
  Saved: "محفوظ", Group: "مجموعة", "Soft round": "دائرية ناعمة", px: "بكسل", Share: "مشاركة",
};
export const lang = new URLSearchParams(location.search).get("lang") ?? "en";
export const t = (s: string) => (lang === "ar" ? (ar[s] ?? s) : s);
