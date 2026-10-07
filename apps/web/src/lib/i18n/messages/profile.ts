import { defineMessages } from './define';

/** FT-12: Restaurant Settings -- Profile (name and logo). */
export const profileMessages = defineMessages({
  en: {
    'profile.heading': 'Restaurant profile',
    'profile.description': 'The name and logo your team and guests see.',
    'profile.viewOnly': 'You have view-only access to the Restaurant profile.',
    'profile.needsFullScope': 'Changing the Restaurant profile requires access to all branches.',

    'profile.name': 'Restaurant name',
    'profile.name.error.required': 'Enter the restaurant name.',
    'profile.save': 'Save name',
    'profile.saved': 'Restaurant name saved.',

    'profile.logo.heading': 'Logo',
    'profile.logo.description': 'Shown in the Staff sidebar, on the guest menu and on printed receipts.',
    'profile.logo.empty': 'No logo yet. Only the restaurant name is shown.',
    'profile.logo.upload': 'Upload logo',
    'profile.logo.replace': 'Replace logo',
    'profile.logo.remove': 'Remove logo',
    'profile.logo.helper': 'JPEG, PNG or WebP, up to 5 MB. A square image works best.',
    'profile.logo.saved': 'Logo updated.',
    'profile.logo.removed': 'Logo removed.',
    'profile.logo.removeConfirm.title': 'Remove the logo?',
    'profile.logo.removeConfirm.description': 'Only the restaurant name is shown instead. Past orders are not affected.',

    'profile.currency': 'Currency',
    'profile.currencyNote': 'The currency is set when the restaurant is created and cannot be changed here.',
  },
  ar: {
    'profile.heading': 'الملف التعريفي للمطعم',
    'profile.description': 'الاسم والشعار اللذان يراهما فريقك وضيوفك.',
    'profile.viewOnly': 'لديك صلاحية عرض فقط للملف التعريفي للمطعم.',
    'profile.needsFullScope': 'تغيير الملف التعريفي للمطعم يتطلب الوصول إلى كل الفروع.',

    'profile.name': 'اسم المطعم',
    'profile.name.error.required': 'أدخل اسم المطعم.',
    'profile.save': 'حفظ الاسم',
    'profile.saved': 'تم حفظ اسم المطعم.',

    'profile.logo.heading': 'الشعار',
    'profile.logo.description': 'يظهر في الشريط الجانبي للموظفين وفي قائمة الضيوف وعلى الإيصالات المطبوعة.',
    'profile.logo.empty': 'لا يوجد شعار بعد. يظهر اسم المطعم فقط.',
    'profile.logo.upload': 'رفع الشعار',
    'profile.logo.replace': 'استبدال الشعار',
    'profile.logo.remove': 'إزالة الشعار',
    'profile.logo.helper': 'JPEG أو PNG أو WebP، حتى 5 ميجابايت. الصورة المربعة هي الأنسب.',
    'profile.logo.saved': 'تم تحديث الشعار.',
    'profile.logo.removed': 'تمت إزالة الشعار.',
    'profile.logo.removeConfirm.title': 'إزالة الشعار؟',
    'profile.logo.removeConfirm.description': 'سيظهر اسم المطعم فقط بدلًا منه. لا تتأثر الطلبات السابقة.',

    'profile.currency': 'العملة',
    'profile.currencyNote': 'تُحدَّد العملة عند إنشاء المطعم ولا يمكن تغييرها من هنا.',
  },
});
