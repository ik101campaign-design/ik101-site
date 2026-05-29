import { dotColor, shouldAnimate } from '../../src/components/hero/globe-style';

test('pending and newest dots use the accent color', () => {
  expect(dotColor({ pending: true, isNewest: false })).toBe('#00bf63');
  expect(dotColor({ pending: false, isNewest: true })).toBe('#00bf63');
});

test('ordinary dots are muted gray', () => {
  expect(dotColor({ pending: false, isNewest: false })).toBe('#2e9a55');
});

test('shouldAnimate respects reduced motion + visibility', () => {
  expect(shouldAnimate({ reducedMotion: true, visible: true })).toBe(false);
  expect(shouldAnimate({ reducedMotion: false, visible: false })).toBe(false);
  expect(shouldAnimate({ reducedMotion: false, visible: true })).toBe(true);
});
