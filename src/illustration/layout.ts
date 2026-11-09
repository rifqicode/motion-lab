import { MOBILE_SAFE_AREA } from '../render/config';
export const layoutFor = (width: number, height: number) => {
  const ratio = width / height;
  if (ratio > 1.3) {
    const s = height / 1080;
    return {
      mode: 'landscape',
      margin: 72 * s,
      rightMargin: 72 * s,
      headerY: 54 * s,
      headerFont: 22 * s,
      titleY: 195 * s,
      titleWidth: width * 0.4,
      titleFont: 78 * s,
      captionY: height * 0.7,
      captionWidth: width * 0.38,
      captionFont: 32 * s,
      indicatorBottom: 60 * s,
      art: {
        left: width * 0.46,
        top: height * 0.16,
        width: width * 0.52,
        height: height * 0.77,
        viewBox: '100 540 950 1050',
      },
    };
  }
  if (ratio > 0.8) {
    const s = width / 1080;
    return {
      mode: 'square',
      margin: 60 * s,
      rightMargin: 60 * s,
      headerY: 42 * s,
      headerFont: 19 * s,
      titleY: 110 * s,
      titleWidth: width - 120 * s,
      titleFont: 60 * s,
      captionY: height * 0.84,
      captionWidth: width - 120 * s,
      captionFont: 26 * s,
      indicatorBottom: 35 * s,
      art: {
        left: width * 0.08,
        top: height * 0.24,
        width: width * 0.84,
        height: height * 0.57,
        viewBox: '100 540 950 1050',
      },
    };
  }
  const s = width / 1080;
  return {
    mode: 'portrait',
    margin: MOBILE_SAFE_AREA.left * s,
    rightMargin: MOBILE_SAFE_AREA.right * s,
    headerY: MOBILE_SAFE_AREA.top * s,
    headerFont: 25 * s,
    titleY: 270 * s,
    titleWidth: width - (MOBILE_SAFE_AREA.left + MOBILE_SAFE_AREA.right) * s,
    titleFont: 90 * s,
    captionY: height - MOBILE_SAFE_AREA.bottom * s - 120 * s,
    captionWidth: width - (MOBILE_SAFE_AREA.left + MOBILE_SAFE_AREA.right) * s,
    captionFont: 34 * s,
    indicatorBottom: 116 * s,
    art: {
      left: MOBILE_SAFE_AREA.left * s,
      top: 520 * s,
      width: width - (MOBILE_SAFE_AREA.left + MOBILE_SAFE_AREA.right) * s,
      height: 900 * s,
      viewBox: '80 540 920 1000',
    },
  };
};
