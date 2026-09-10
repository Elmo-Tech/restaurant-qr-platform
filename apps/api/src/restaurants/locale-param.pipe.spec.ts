import { BadRequestException } from '@nestjs/common';
import { LocaleParamPipe } from './locale-param.pipe';

describe('LocaleParamPipe', () => {
  const pipe = new LocaleParamPipe();

  it.each(['en', 'ar', 'EN', ' ar '])(
    'normalizes and accepts a supported locale (%s)',
    (value) => {
      expect(pipe.transform(value)).toBe(value.trim().toLowerCase());
    },
  );

  it.each(['fr', 'en-US', 'en-us', 'ar-EG', '', 'english'])(
    'rejects an unsupported locale (%s) with the exact VALIDATION_ERROR envelope',
    (value) => {
      expect(() => pipe.transform(value)).toThrow(BadRequestException);
      try {
        pipe.transform(value);
        fail('expected transform to throw');
      } catch (error) {
        expect((error as BadRequestException).getResponse()).toEqual({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'The request contains invalid data.',
            details: { fields: [{ field: 'locale', code: 'INVALID_VALUE' }] },
          },
        });
      }
    },
  );
});
