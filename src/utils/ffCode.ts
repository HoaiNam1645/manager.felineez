// Map an ff_code prefix (LMX-8057, HPE-ELI-..., …) to its factory name for display.
const FF_PREFIX_NAMES: { [p: string]: string } = {
    LMX: 'Lemiex',
    MGO: 'MangoTee',
    VNW: 'Vinaway',
    MKP: 'MonkeyKing',
    DSH: 'Dreamship',
    HPE: 'HongPhat',
    HGT: 'Hogoto',
};

export const ffFactoryName = (code: string): string => {
    const m = /^([A-Z]{3})-/.exec(code || '');
    return (m && FF_PREFIX_NAMES[m[1]]) || code;
};
