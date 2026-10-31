# Medical Inventory Management System

نظام لإدارة المخزون الطبي. المشروع كله في Repository واحد، وكل جزء في مجلده المستقل:

| المجلد | الجزء | التقنية |
| --- | --- | --- |
| [`Meditrack-Front`](Meditrack-Front) | Frontend | React + Vite |
| [`Meditrack-Back`](Meditrack-Back) | Backend | Laravel (PHP) |

## المتطلبات

- Git
- PHP 8.3 أو أحدث
- Composer
- Node.js 22 أو أحدث

## التشغيل لأول مرة

```sh
git clone <REPO_URL> "Medical Inventory Management System"
cd "Medical Inventory Management System"
```

### Backend

```sh
cd Meditrack-Back
composer install
php -r "copy('.env.example', '.env');"
php artisan key:generate
php -r "touch('database/database.sqlite');"
php artisan migrate
php artisan serve
```

يعمل على <http://localhost:8000>.

### Frontend

من نافذة Terminal ثانية، ومن المجلد الرئيسي للمشروع:

```sh
cd Meditrack-Front
npm install
npm run dev
```

يعمل على <http://localhost:5173>.

## طريقة العمل الجماعي

1. قبل البدء، حدّثي نسختك من `main`:

   ```sh
   git checkout main
   git pull origin main
   ```

2. أنشئي Branch خاصًا بالمهمة:

   ```sh
   git checkout -b front/login-page
   ```

   ابدئي اسم الـ Branch بـ `front/` لمهام الـ Frontend و`back/` لمهام الـ Backend.

3. احفظي تعديلاتك وارفعيها:

   ```sh
   git add .
   git commit -m "Add login page"
   git push -u origin front/login-page
   ```

4. افتحي Pull Request على `main` في GitHub، وبعد المراجعة يتم الدمج.

## قواعد مهمة

- لا ترفعي ملف `.env` أبدًا، لأنه يحتوي على إعدادات وأسرار خاصة بجهازك. عند إضافة متغير جديد، أضيفيه إلى `.env.example` بدون قيمته السرية.
- لا ترفعي `vendor` أو `node_modules` أو قاعدة البيانات المحلية. هذه الملفات مستثناة تلقائيًا.
- بعد أي `git pull` يغيّر الحزم أو قاعدة البيانات، شغّلي `composer install` و`php artisan migrate` في الـ Backend، و`npm install` في الـ Frontend.
- لا تعدّلي Migration تم دمجه في `main`. أنشئي Migration جديدًا بدلًا منه.
