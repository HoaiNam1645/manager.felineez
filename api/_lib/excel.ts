// ExcelJS ESM compatibility wrapper
import * as ExcelJSModule from 'exceljs';

const mod = ExcelJSModule as any;
export const Workbook = mod.default?.Workbook || mod.Workbook;
export default mod.default || mod;
