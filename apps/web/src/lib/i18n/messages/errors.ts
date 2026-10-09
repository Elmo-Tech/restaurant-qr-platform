import { defineMessages } from './define';

/**
 * FT-10A: Staff-facing text for the remaining stable Backend error codes
 * (`describeError` looks these up as `error.<CODE>`). Codes that are not
 * listed here still show the Backend's own English message.
 */
export const errorMessages = defineMessages({
  en: {
    'error.BRANCH_ACCESS_DENIED': 'You do not have access to this branch.',
    'error.BRANCH_NOT_FOUND': 'Branch not found.',
    'error.BRANCH_NOT_OPERATIONAL': 'This branch is not currently operational.',
    'error.CATEGORY_NOT_FOUND': 'Category not found.',
    'error.CSRF_VALIDATION_FAILED': 'The request could not be verified. Refresh the page and try again.',
    'error.DEFAULT_LOCALE_REQUIRED': 'The default language must stay active.',
    'error.DEFAULT_TRANSLATION_REQUIRED': 'The default-language name is required.',
    'error.DELIVERY_ZONE_INVALID': 'This delivery area is not valid.',
    'error.DELIVERY_ZONE_NOT_FOUND': 'Delivery area not found.',
    'error.GENERIC_QR_NOT_FOUND': 'This restaurant does not have a Restaurant QR yet.',
    'error.IMAGE_REQUIRED': 'Please choose an image.',
    'error.IMAGE_TOO_LARGE': 'Image must be 5 MB or smaller.',
    'error.INVALID_IMAGE_TYPE': 'Only JPEG, PNG, and WebP images are supported.',
    'error.LOCALE_NOT_ACTIVE': 'This language is not active for the restaurant.',
    'error.MENU_NOT_FOUND': 'Menu not found.',
    'error.MODIFIER_GROUP_NOT_FOUND': 'Modifier group not found.',
    'error.MODIFIER_INVALID_SELECTION_RANGE':
      'Maximum selections must be at least the minimum, and at least 1.',
    'error.MODIFIER_OPTION_NOT_FOUND': 'Modifier option not found.',
    'error.MODIFIER_PRESET_NOT_FOUND': 'Preset not found.',
    'error.MODIFIER_PRESET_OPTION_NOT_FOUND': 'Preset option not found.',
    'error.PRODUCT_NOT_FOUND': 'Product not found.',
    'error.QR_NOT_FOUND': 'QR code not found.',
    'error.RESTAURANT_NOT_FOUND': 'Restaurant not found.',
    'error.RESTAURANT_NOT_OPERATIONAL': 'This restaurant is not currently operational.',
    'error.TABLE_NOT_FOUND': 'Table not found.',
    'error.TABLE_INACTIVE': 'This table is inactive, so a session cannot be opened.',
    'error.TABLE_SESSION_NOT_FOUND': 'This session was not found.',
    'error.TABLE_SESSION_ALREADY_OPEN': 'This table already has an open session.',
    'error.SESSION_HAS_PENDING_ORDERS':
      'This session has pending orders. Choose whether to keep or reject them, then try again.',
    'error.SESSION_NOT_CLOSED': 'A payment can only be recorded on a closed session.',
    'error.NOTHING_TO_SETTLE': 'This session has no outstanding balance.',
    'error.PAYMENT_AMOUNT_MISMATCH':
      'The balance changed while you were working. Review the updated balance and try again.',
    'error.PAYMENT_NOT_FOUND': 'Payment record not found.',
    'error.PAYMENT_ALREADY_VOIDED': 'This payment record was already voided.',
    'error.ORDER_CANCEL_BLOCKED_BY_SETTLEMENT':
      'This order cannot be cancelled while its table session has a recorded payment. Void the payment record first.',
    'error.TABLE_NUMBER_ALREADY_EXISTS': 'A table with this number already exists in this branch.',
  },
  ar: {
    'error.BRANCH_ACCESS_DENIED': 'ليست لديك صلاحية الوصول إلى هذا الفرع.',
    'error.BRANCH_NOT_FOUND': 'الفرع غير موجود.',
    'error.BRANCH_NOT_OPERATIONAL': 'هذا الفرع غير متاح للتشغيل حاليًا.',
    'error.CATEGORY_NOT_FOUND': 'القسم غير موجود.',
    'error.CSRF_VALIDATION_FAILED': 'تعذّر التحقق من الطلب. حدّث الصفحة وحاول مرة أخرى.',
    'error.DEFAULT_LOCALE_REQUIRED': 'يجب أن تبقى اللغة الافتراضية مفعّلة.',
    'error.DEFAULT_TRANSLATION_REQUIRED': 'اسم اللغة الافتراضية مطلوب.',
    'error.DELIVERY_ZONE_INVALID': 'منطقة التوصيل هذه غير صالحة.',
    'error.DELIVERY_ZONE_NOT_FOUND': 'منطقة التوصيل غير موجودة.',
    'error.GENERIC_QR_NOT_FOUND': 'ليس لدى هذا المطعم رمز QR للمطعم بعد.',
    'error.IMAGE_REQUIRED': 'يرجى اختيار صورة.',
    'error.IMAGE_TOO_LARGE': 'يجب ألا يتجاوز حجم الصورة 5 ميجابايت.',
    'error.INVALID_IMAGE_TYPE': 'يُدعم فقط صور JPEG وPNG وWebP.',
    'error.LOCALE_NOT_ACTIVE': 'هذه اللغة غير مفعّلة للمطعم.',
    'error.MENU_NOT_FOUND': 'القائمة غير موجودة.',
    'error.MODIFIER_GROUP_NOT_FOUND': 'مجموعة الإضافات غير موجودة.',
    'error.MODIFIER_INVALID_SELECTION_RANGE':
      'يجب ألا يقل الحد الأقصى للاختيارات عن الحد الأدنى، وألا يقل عن 1.',
    'error.MODIFIER_OPTION_NOT_FOUND': 'خيار الإضافة غير موجود.',
    'error.MODIFIER_PRESET_NOT_FOUND': 'القالب غير موجود.',
    'error.MODIFIER_PRESET_OPTION_NOT_FOUND': 'خيار القالب غير موجود.',
    'error.PRODUCT_NOT_FOUND': 'المنتج غير موجود.',
    'error.QR_NOT_FOUND': 'رمز QR غير موجود.',
    'error.RESTAURANT_NOT_FOUND': 'المطعم غير موجود.',
    'error.RESTAURANT_NOT_OPERATIONAL': 'هذا المطعم غير متاح للتشغيل حاليًا.',
    'error.TABLE_NOT_FOUND': 'الطاولة غير موجودة.',
    'error.TABLE_INACTIVE': 'هذه الطاولة غير نشطة، لذلك لا يمكن فتح جلسة لها.',
    'error.TABLE_SESSION_NOT_FOUND': 'لم يتم العثور على هذه الجلسة.',
    'error.TABLE_SESSION_ALREADY_OPEN': 'لدى هذه الطاولة جلسة مفتوحة بالفعل.',
    'error.SESSION_HAS_PENDING_ORDERS':
      'في هذه الجلسة طلبات قيد الانتظار. اختر إبقاءها أو رفضها ثم حاول مرة أخرى.',
    'error.SESSION_NOT_CLOSED': 'لا يمكن تسجيل الدفع إلا على جلسة مغلقة.',
    'error.NOTHING_TO_SETTLE': 'لا يوجد رصيد مستحق على هذه الجلسة.',
    'error.PAYMENT_AMOUNT_MISMATCH':
      'تغيّر الرصيد أثناء عملك. راجع الرصيد المحدّث ثم حاول مرة أخرى.',
    'error.PAYMENT_NOT_FOUND': 'لم يتم العثور على سجل الدفع.',
    'error.PAYMENT_ALREADY_VOIDED': 'تم إلغاء سجل الدفع هذا بالفعل.',
    'error.ORDER_CANCEL_BLOCKED_BY_SETTLEMENT':
      'لا يمكن إلغاء هذا الطلب لأن جلسة الطاولة لها دفعة مسجلة. ألغِ سجل الدفع أولًا.',
    'error.TABLE_NUMBER_ALREADY_EXISTS': 'توجد طاولة بهذا الرقم في هذا الفرع بالفعل.',
  },
});
