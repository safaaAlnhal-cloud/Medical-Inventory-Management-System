# ابدئي من هنا: الأساس المشترك جاهز

المرحلة 1 من [`BACKEND_PLAN.md`](BACKEND_PLAN.md) انتهت. هذا الملف يشرح ما بُني، وأين تجدين كل شيء، وكيف نعمل معًا على Git.

| الملف | متى تقرئينه |
|---|---|
| [`BACKEND_PLAN.md`](BACKEND_PLAN.md) | المراحل، ومهام كل مسار |
| [`CONVENTIONS.md`](CONVENTIONS.md) | قبل أول سطر كود: أسلوب الـ Controllers والتحقق والـ Services والـ Resources |
| [`../Meditrack-Front/BACKEND_HANDOFF.md`](../Meditrack-Front/BACKEND_HANDOFF.md) | العقد مع الواجهة: كل endpoint وحقل وقاعدة. **المرجع عند أي خلاف** |

## 1. تشغيل المشروع على جهازك

المتطلبات: PHP 8.3+، وComposer، وMySQL (Laragon مثلًا)، وNode.js.

**الـ Backend** (داخل `Meditrack-Back`):

```bash
composer install
cp .env.example .env          # ثم عدّلي DB_USERNAME / DB_PASSWORD إن لزم
php artisan key:generate
# أنشئي قاعدة بيانات فارغة اسمها meditrack في MySQL
php artisan migrate --seed    # الجداول + البيانات التجريبية
php artisan test              # يجب أن ينجح كله
php artisan serve             # http://localhost:8000
```

**الواجهة** (داخل `Meditrack-Front`):

```bash
npm install
cp .env.example .env          # VITE_USE_MOCK_DATA=true للـ Mock، أو false للـ API الحقيقي
npm run dev                   # http://localhost:5173
```

**حسابات تجريبية:** الأدمن `sara@medcenter.ps` / `admin123`. أمناء المخزن كلمة مرورهم `store123`:

| الحساب | الحالة |
|---|---|
| `omar@medcenter.ps` | فعّال |
| `reem@medcenter.ps` | فعّال، وينتهي بعد 5 أيام: لتجربة تنبيهات انتهاء الحساب |
| `mahmoud@medcenter.ps` | معطّل: لتجربة منع الدخول |
| `safaa@medcenter.ps` | فعّال |

`php artisan migrate:fresh --seed` يعيد القاعدة لحالتها الأولى في أي وقت.

## 2. ما بُني في المرحلة 1

| الجزء | المكان | ملاحظات |
|---|---|---|
| **قاعدة البيانات** | `database/migrations` | 14 ملف migration، والتصميم مشروح في القسم 9 من الـ handoff. **مغلقة:** أي تغيير = migration جديد |
| **Models** | `app/Models` | العلاقات، والـ casts، ودوال مثل `isArchived()` و`canUseSystem()`، والـ scopes مثل `Item::active()` |
| **Enums** | `app/Enums` | كل القيم الثابتة: الأدوار، والوحدات، وأنواع العمليات والتنبيهات والتقارير |
| **بيانات تجريبية** | `database/seeders` | مطابقة لأرقام الـ Mock تمامًا. الكميات والمتوسطات تُحسب بـ `StockService`، نفس كود العمليات |
| **Factories** | `database/factories` | لإنشاء بيانات في الاختبارات: `Item::factory()->archived()->create()` |
| **الأخطاء** | `bootstrap/app.php`، `app/Exceptions/ConflictException.php` | كل خطأ API بشكل `{ message, errors }` الذي تنتظره الواجهة. للتعارض: `throw ConflictException::on('field', '...')` → 409 |
| **الدخول** | Sanctum | tokens جاهزة، والـ endpoints نفسها مهمة B في المرحلة 2 |
| **الـ Routes** | `routes/api.php` و`routes/api/*.php` | ملف لكل وحدة، وكل الملفات تحتاج تسجيل دخول تلقائيًا. للأدمن فقط: `->middleware('role:admin')` |
| **الاختبارات** | `tests/` | SQLite في الذاكرة، ولا تلمس MySQL. `actingAsAdmin()` و`actingAsStorekeeper()` في `tests/TestCase.php` |
| **CORS، والمنطقة الزمنية** | `config/cors.php`، `config/app.php` | يقبل `FRONTEND_URL` فقط، و"اليوم" بتوقيت `Asia/Gaza` |

## 3. الـ Services المشتركة (العقود بين المسارين)

توقيعاتها ثابتة، ومحروسة بـ `tests/Feature/Foundation/SharedContractsTest.php`: إذا غيّرت إحدانا توقيعًا يفشل الاختبار. أي تغيير عليها نتفق عليه معًا أولًا.

| الخدمة | تبنيها | تستعملها | حالتها |
|---|---|---|---|
| `ManufacturerService::resolve($name)` | B | A في Incoming، وB في ربط الباركود | **جاهزة ومختبرة**. استدعيها داخل `DB::transaction` الخاص بالعملية |
| `ManufacturerService::search($search)` | B | `GET /manufacturers` | **جاهزة ومختبرة**، ومعها `getManufacturersApi` في الواجهة |
| `NotificationService::syncItem($item)` / `syncUser($user)` / `syncAll()` | B | A في نهاية StockService، وB في الأرشفة والمستخدمين | **فارغة حتى المرحلة 4**، لكن يمكن استدعاؤها من الآن دون أي خطأ |
| `ReportService::build($type, $filters, $page, $pageSize)` → `ReportResult` | A | B في التصدير | المرحلة 5. شكل `ReportResult` و`ReportFilters` ثابت الآن في `app/Reports` |

## 4. من يملك أي ملف

**Developer A (المخزون والعمليات):** `routes/api/batches.php`، و`transactions.php`، و`dashboard.php`، و`reports.php`، وما يتبعها من Controllers وRequests وResources وServices
(`StockService`، و`TransactionService`، و`ReportService`...)، وصفحات الواجهة الخاصة بها.

**Developer B (الحسابات والأصناف والمنصة):** `routes/api/auth.php`، و`users.php`، و`profile.php`، و`categories.php`، و`items.php`، و`manufacturers.php`،
و`notifications.php`، و`exports.php`، وما يتبعها، و`ManufacturerService` و`NotificationService`، وصفحات الواجهة الخاصة بها.

**ملفات مشتركة: أخبري الأخرى قبل تعديلها:**

- `app/Models/*`، و`app/Enums/*`
- `routes/api.php`، و`bootstrap/app.php`، و`app/Providers/AppServiceProvider.php`
- `tests/TestCase.php`، و`database/seeders/DemoDataSeeder.php`
- الـ Services المشتركة (القسم 3)
- `BACKEND_HANDOFF.md`، و`BACKEND_PLAN.md`، و`CONVENTIONS.md`
- ملفات الواجهة المشتركة: `src/services/apiAxios.js`، وبيانات الـ Mock المشتركة، والـ layout والقائمة الجانبية

## 5. طريقة العمل على Git

**`main` يعمل دائمًا:** لا يُرفع إليه كود تفشل اختباراته.

**لكل ميزة فرع:**

```bash
git checkout main
git pull                              # آخر نسخة قبل البدء
git checkout -b a/incoming            # a/ أو b/ ثم اسم الميزة
# ... العمل، مع commits صغيرة ...
php artisan test                      # قبل الرفع
git push -u origin a/incoming
```

ثم **Pull Request** على GitHub إلى `main`. الأخرى تلقي نظرة (خصوصًا إذا لمس ملفًا مشتركًا)، ثم Merge. بعد الدمج: `git checkout main && git pull`.

**قواعد:**

- **commit صغير وواضح بالإنجليزية:** `Add incoming transactions endpoint`، وليس `update`.
- **migration جديد فقط:** لا نعدّل ولا نعيد تسمية migration مرفوعًا. بعد `git pull` فيه migration جديد: `php artisan migrate`.
- **لا نرفع أبدًا:** `.env`، و`vendor/`، و`node_modules/` (الـ `.gitignore` يمنعها).
- **لا `git push --force`** على `main`.
- **Merge Conflict:** لا تحذفي كود الأخرى لتخلّصي. افتحي الملف، وافهمي التغييرين، وإذا لم يكن الحل واضحًا اسأليها.
- **عند تعديل الـ handoff:** يُعدّل في نفس الفرع مع الكود الذي غيّر العقد، حتى لا يختلفا.
- **حزمة Composer أو npm جديدة:** تُرفع مع `composer.lock` أو `package-lock.json`. الأخرى تشغّل بعد الـ pull `composer install` أو `npm install`.

## 6. أشياء مؤقتة يجب ألا تُنسى (المرحلة 6)

- `GET /api/user` في `routes/api.php`: مسار تجريبي لـ Sanctum، يُحذف عندما يُبنى `/auth/me`.
- تحديثات Symfony الأمنية (`composer audit`).
