# Parkour Flow

نموذج أولي بسيط (Web) للعبة باركور بمنظور الشخص الأول باستخدام Three.js.

## التشغيل
- افتح `index.html` مباشرة في المتصفح، أو شغّل خادمًا محليًا:

```bash
# داخل مجلد المشروع
python3 -m http.server 8080
# ثم افتح http://localhost:8080/parkour/
```

## التحكم
- الحركة: WASD
- قفز: Space
- انزلاق: Ctrl
- التقاط الحافة/تسلق: E
- إعادة إلى آخر نقطة حفظ: R
- بدء/إيقاف المؤقّت: T

يعتمد الصوت الديناميكي على السرعة (يزداد مع الزخم). الواجهة تعرض مؤقّتًا ومؤشر زخم فقط.

---

A minimal first-person parkour prototype (Web) built with Three.js.

- Open `index.html` directly or serve locally.
- Pointer-lock activates on click. Dynamic music intensity scales with speed.