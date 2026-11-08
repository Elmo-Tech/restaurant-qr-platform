/**
 * The sentence shown under a checkout field for each problem `checkout-validation.ts` can find,
 * in the two Platform languages. Kept apart from `copy.ts` so the checkout rules and their words
 * live together. Text comes from the issue code, never from the API's English message.
 */
import type { CheckoutField, FieldIssue } from './checkout-validation';

export interface IssueContext {
  /** The field's maximum length (`CHECKOUT_LIMITS[field].max`), named in the "too long" sentence. */
  max: number;
  /** True when the Restaurant's country is Egypt: the phone hint can name the 11-digit format. */
  egyptianPhone: boolean;
}

type Sentences = Record<FieldIssue, string>;

function arabic(field: CheckoutField, context: IssueContext): Sentences {
  const max = context.max;
  const tooLong = `النص طويل جدًا، الحد الأقصى ${max} حرفًا.`;
  const generic: Sentences = {
    required: 'هذا الحقل مطلوب.',
    tooShort: 'النص قصير جدًا.',
    tooLong,
    invalidPhone: 'رقم الهاتف غير صحيح.',
    needsLetter: 'اكتب النص بالحروف.',
    invalid: 'هذه القيمة غير صالحة.',
  };
  switch (field) {
    case 'customerName':
      return {
        ...generic,
        required: 'أدخل اسمك.',
        tooShort: 'الاسم قصير جدًا، اكتب حرفين على الأقل.',
        tooLong: `الاسم طويل جدًا، الحد الأقصى ${max} حرفًا.`,
        needsLetter: 'اكتب الاسم بالحروف.',
      };
    case 'customerPhone':
      return {
        ...generic,
        required: 'أدخل رقم هاتفك.',
        invalidPhone: context.egyptianPhone
          ? 'رقم الهاتف غير صحيح. أدخل 11 رقمًا يبدأ بـ 01، مثل 01012345678.'
          : 'رقم الهاتف غير صحيح. إن كان الرقم من دولة أخرى فابدأه بـ + ثم كود الدولة.',
      };
    case 'deliveryAddress':
      return {
        ...generic,
        required: 'أدخل عنوان التوصيل.',
        tooShort: 'العنوان قصير جدًا، اكتب الشارع والمنطقة (5 أحرف على الأقل).',
        tooLong: `العنوان طويل جدًا، الحد الأقصى ${max} حرفًا.`,
        needsLetter: 'اكتب العنوان بالحروف مع اسم الشارع، وليس أرقامًا فقط.',
      };
    default:
      return generic;
  }
}

function english(field: CheckoutField, context: IssueContext): Sentences {
  const max = context.max;
  const generic: Sentences = {
    required: 'This field is required.',
    tooShort: 'This is too short.',
    tooLong: `This is too long (${max} characters at most).`,
    invalidPhone: 'This phone number is not valid.',
    needsLetter: 'Please use letters.',
    invalid: 'This value is not valid.',
  };
  switch (field) {
    case 'customerName':
      return {
        ...generic,
        required: 'Enter your name.',
        tooShort: 'Your name is too short, use at least 2 letters.',
        tooLong: `Your name is too long (${max} characters at most).`,
        needsLetter: 'Write your name using letters.',
      };
    case 'customerPhone':
      return {
        ...generic,
        required: 'Enter your phone number.',
        invalidPhone: context.egyptianPhone
          ? 'This phone number is not valid. Enter 11 digits starting with 01, like 01012345678.'
          : 'This phone number is not valid. For a number from another country, start with + and the country code.',
      };
    case 'deliveryAddress':
      return {
        ...generic,
        required: 'Enter your delivery address.',
        tooShort: 'The address is too short, add the street and area (at least 5 characters).',
        tooLong: `The address is too long (${max} characters at most).`,
        needsLetter: 'Write the address with the street name, not only numbers.',
      };
    default:
      return generic;
  }
}

export function checkoutIssueMessage(
  locale: string,
  field: CheckoutField,
  issue: FieldIssue,
  context: IssueContext,
): string {
  return (locale === 'ar' ? arabic(field, context) : english(field, context))[issue];
}
