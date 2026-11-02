import { defineMessages } from './define';

/** Temporary demo restaurants (DEC-060): the secret-link page, the countdown banner and the photo credits. */
export const demoMessages = defineMessages({
  en: {
    'demo.enter.title': 'Opening your demo…',
    'demo.enter.body': 'One moment, we are getting the restaurant ready for you.',
    'demo.enter.failed.title': 'This demo link has ended',
    'demo.enter.failed.body':
      'The link is not valid, or the demo time is over. Ask the Wayta team for a new link.',
    'demo.visitor': 'Demo visitor',
    'demo.banner.label': 'Demo restaurant',
    'demo.banner.endsIn': 'Ends in {time}',
    'demo.banner.ended': 'The demo has ended',
    'demo.banner.note': 'Everything here is sample data. It is deleted for good when the demo ends.',
    'demo.banner.credits': 'Photo credits',
    'demo.time.dh': '{d} d {h} h',
    'demo.time.hm': '{h} h {m} min',
    'demo.time.m': '{m} min',
    'error.DEMO_RESTRICTED': 'This is not available in a demo restaurant.',
    'demo.credits.title': 'Demo photo credits',
    'demo.credits.intro':
      'The photos in the Wayta demo restaurant come from Wikimedia Commons. They are shown as they are, under the licence of each author.',
    'demo.credits.col.product': 'Dish',
    'demo.credits.col.photo': 'Photo',
    'demo.credits.col.author': 'Author',
    'demo.credits.col.licence': 'Licence',
  },
  ar: {
    'demo.enter.title': 'جارٍ فتح العرض التجريبي…',
    'demo.enter.body': 'لحظة من فضلك، نجهّز المطعم من أجلك.',
    'demo.enter.failed.title': 'انتهى رابط العرض التجريبي',
    'demo.enter.failed.body':
      'الرابط غير صالح أو انتهى وقت العرض. اطلب رابطًا جديدًا من فريق ويتا.',
    'demo.visitor': 'زائر العرض',
    'demo.banner.label': 'مطعم تجريبي',
    'demo.banner.endsIn': 'ينتهي بعد {time}',
    'demo.banner.ended': 'انتهى العرض التجريبي',
    'demo.banner.note': 'كل ما هنا بيانات تجريبية، وتُحذف نهائيًا عند انتهاء العرض.',
    'demo.banner.credits': 'حقوق الصور',
    'demo.time.dh': '{d} يوم {h} ساعة',
    'demo.time.hm': '{h} ساعة {m} دقيقة',
    'demo.time.m': '{m} دقيقة',
    'error.DEMO_RESTRICTED': 'هذا غير متاح في المطعم التجريبي.',
    'demo.credits.title': 'حقوق صور العرض التجريبي',
    'demo.credits.intro':
      'صور مطعم ويتا التجريبي من Wikimedia Commons. تُعرض كما هي وبحسب ترخيص كل مؤلف.',
    'demo.credits.col.product': 'الطبق',
    'demo.credits.col.photo': 'الصورة',
    'demo.credits.col.author': 'المؤلف',
    'demo.credits.col.licence': 'الترخيص',
  },
});
