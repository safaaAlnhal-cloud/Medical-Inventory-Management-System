# أسلوب كتابة الكود في MediTrack Backend

اتفاق بين المطوّرتين حتى يبدو الكود كأن شخصًا واحدًا كتبه. العقد مع الواجهة (أسماء الحقول، شكل الردود، الأخطاء) موجود في
[`Meditrack-Front/BACKEND_HANDOFF.md`](../Meditrack-Front/BACKEND_HANDOFF.md)، وهو المرجع عند أي اختلاف.

## 1. رحلة الطلب: كل طبقة لها وظيفة واحدة

```
Request -> Route -> Form Request -> Controller -> Service -> Model
                                         |
Response <-------------------------- Resource
```

| الطبقة | المكان | وظيفتها | ممنوع فيها |
|---|---|---|---|
| Route | `routes/api/<module>.php` | المسار، والصلاحية (`role:admin`) | أي منطق |
| Form Request | `app/Http/Requests/<Module>/` | شكل البيانات: مطلوب، رقم، تاريخ، طول | الاستعلام عن تعارضات مع بيانات موجودة |
| Controller | `app/Http/Controllers/<Module>/` | يستلم الطلب، يستدعي الـ Service، يرجع Resource | الحسابات، و`DB::transaction` |
| Service | `app/Services/` | قواعد العمل، والتعارضات (409)، والـ transactions | `request()`، والـ JSON |
| Resource | `app/Http/Resources/` | تحويل الـ Model لشكل الواجهة | الاستعلامات (تُحمّل مسبقًا بـ `with`) |

**لماذا الـ Service منفصل؟** لأن نفس القاعدة تُستدعى من أكثر من مكان: `StockService` يستدعيه الوارد والصادر والتعديل والإلغاء والـ Seeder،
والاختبارات تستدعيه مباشرة دون HTTP.

## 2. أسماء الحقول: camelCase للخارج، snake_case للداخل

- الواجهة ترسل وتستقبل **camelCase**: `categoryId`، `minQty`، `accountExpiresOn`.
- قاعدة البيانات والـ Models **snake_case**: `category_id`، `min_qty`.
- التحويل يحصل في مكانين فقط: **Form Request** (قواعد التحقق بأسماء camelCase، فتطلع مفاتيح أخطاء 422 بنفس أسماء حقول الواجهة)،
  و**Resource** (الرد).

## 3. Form Request

```php
// app/Http/Requests/Items/StoreItemRequest.php
class StoreItemRequest extends FormRequest
{
    // الصلاحية على الـ route (role:admin)، فهنا دائمًا true.
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:150'],
            'categoryId' => ['required', 'integer', 'exists:categories,id'],
            'unit' => ['required', Rule::enum(Unit::class)],
            'minQty' => ['required', 'integer', 'min:0'],
            'activeIngredient' => ['nullable', 'string', 'max:150'],
        ];
    }

    // الرسائل بالإنجليزية لأن الواجهة إنجليزية. نكتبها عندما رسالة Laravel الافتراضية غير واضحة للمستخدم.
    public function messages(): array
    {
        return ['categoryId.exists' => 'Choose a category from the list.'];
    }
}
```

**422 أم 409؟**

| الحالة | الكود | أين |
|---|---|---|
| حقل ناقص، نوع خطأ، طول زائد، تاريخ مستقبلي | **422** | Form Request |
| تعارض مع بيانات موجودة: اسم مكرر، باركود مستخدم، كمية أكبر من المخزون، صنف مؤرشف | **409** | Service: `throw ConflictException::on('name', '...')` |

لذلك **لا نستخدم قاعدة `unique` في الـ Form Request**: التكرار عند الواجهة 409 وليس 422، وكثير من التفرد عندنا "بين السجلات الفعالة فقط"،
فيُفحص في الـ Service.

## 4. Controller: رفيع

```php
// app/Http/Controllers/Items/ItemController.php
class ItemController extends Controller
{
    public function __construct(private readonly ItemService $items) {}

    public function store(StoreItemRequest $request): JsonResponse
    {
        $item = $this->items->create($request->validated());

        return ItemResource::make($item)->response()->setStatusCode(201);
    }
}
```

**أكواد النجاح:** إنشاء `201` مع السجل، تعديل `200` مع السجل بعد التعديل، عملية بلا نتيجة (حذف، كلمة مرور) `204` عبر `response()->noContent()`.

## 5. Service

```php
// app/Services/ItemService.php
class ItemService
{
    public function create(array $data): Item
    {
        return DB::transaction(function () use ($data) {
            $this->ensureNameIsFree($data['name']);

            $item = Item::create([
                'name' => $data['name'],
                'category_id' => $data['categoryId'],
                'unit' => $data['unit'],
                'min_qty' => $data['minQty'],
                'active_ingredient' => $data['activeIngredient'] ?? null,
            ]);

            return $item->load('category');
        });
    }

    private function ensureNameIsFree(string $name, ?int $exceptId = null): void
    {
        $taken = Item::active()->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->when($exceptId, fn ($q) => $q->whereKeyNot($exceptId))->exists();

        if ($taken) {
            throw ConflictException::on('name', 'An item with this name already exists.');
        }
    }
}
```

- كل عملية تكتب في أكثر من جدول داخل **`DB::transaction`**: إما تنجح كلها أو لا يُحفظ شيء.
- العمليات التي تغيّر المخزون تقفل الصفوف بـ **`lockForUpdate()`** حتى لا يصرف شخصان نفس الكمية في نفس اللحظة.
- الأرقام المخزنة مؤقتًا (`items.avg_unit_cost`، `batches.quantity`) **يكتبها `StockService` فقط**.
- بعد أي تغيير في المخزون أو في حساب مستخدم: استدعاء مزامنة التنبيهات (`NotificationService`، الخطوة 6).

## 6. Resource

```php
// app/Http/Resources/ItemResource.php
class ItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'categoryId' => $this->category_id,
            'unit' => $this->unit->value,
            'minQty' => $this->min_qty,
            'avgUnitCost' => (float) $this->avg_unit_cost,   // decimal:4 يرجع نصًا "12.5000"
            'archived' => $this->isArchived(),
            'archivedAt' => $this->archived_at?->toISOString(),
            'createdAt' => $this->created_at->toISOString(),
        ];
    }
}
```

| النوع | الشكل | مثال |
|---|---|---|
| تاريخ فقط | `->toDateString()` | `"2026-11-10"` |
| وقت كامل | `->toISOString()` | `"2026-11-10T08:15:00.000000Z"` |
| مال وتكلفة | `(float)`، مع 4 خانات للتكلفة و2 للمجاميع (`round($x, 2)`) | `12.5` |
| Enum | `->value` | `"storekeeper"` |
| حقل نصي فارغ | `null` (وليس `""`)، إلا إذا العقد قال غير ذلك | |

- **لا بيانات عرض:** لا `"$1,200"`، لا `"Today"`. الواجهة تنسّق كل شيء.
- العلاقات تُحمّل في الـ Service أو الـ Controller بـ `with(...)`/`load(...)` قبل الـ Resource، لتجنب استعلام لكل صف (N+1).
- قائمة: `ItemResource::collection($items)`.

## 7. الصلاحيات

- كل routes في `routes/api/*.php` تحتاج تسجيل دخول تلقائيًا (`auth:sanctum` في `routes/api.php`).
- مسارات الأدمن فقط: `->middleware('role:admin')`.
- قواعد خاصة (مثل: لا تعديل على صنف مؤرشف) تُفحص في الـ Service وترجع 409.

## 8. الاختبارات

- ملف اختبار لكل ميزة في `tests/Feature/<Module>/`، و`use RefreshDatabase;` في كل كلاس يلمس قاعدة البيانات.
- الدخول: `$this->actingAsAdmin()` أو `$this->actingAsStorekeeper()` من `tests/TestCase.php`.
- لكل endpoint على الأقل: الحالة الناجحة، و422 لحقل خطأ، و409 للتعارض إن وُجد، و403 إن كان للأدمن فقط.
- قواعد المخزون الحساسة تُختبر على مستوى الـ Service مباشرة، مع حالات حدّية (آخر وحدة، إلغاء ثم تعديل...).
- التشغيل: `php artisan test`، ويجب أن ينجح كله قبل كل push.

## 9. قاعدة البيانات

- **الـ migrations الموجودة مغلقة** بعد رفعها. أي تغيير = migration جديد بتاريخ جديد، ولا نعدّل ملفًا قديمًا.
- القيم الثابتة تُخزن نصًا وتُفحص بـ Enum في `app/Enums`.
- المفاتيح الأجنبية `restrictOnDelete`: لا حذف لسجل مستخدم في مكان آخر.

## 10. Git وملكية الملفات

في [`START_HERE.md`](START_HERE.md)، القسمان 4 و5.
