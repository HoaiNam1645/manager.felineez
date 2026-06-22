import { requireAuth } from '../_lib/auth';
import { prisma } from '../_lib/prisma';
import { Workbook } from '../_lib/excel';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { badRequest, serverError } from '../_lib/helpers';
import fs from 'fs';
import path from 'path';

function colLetterToIndex(col: string) {
  let index = 0;
  for (let i = 0; i < col.length; i++) {
    index = index * 26 + col.charCodeAt(i) - 64;
  }
  return index;
}

function indexToColLetter(index: number): string {
  let result = '';
  while (index > 0) {
    const remainder = (index - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    index = Math.floor((index - 1) / 26);
  }
  return result;
}

function loadCategoryIndex(temuCategoryId: string) {
  // Load main index
  const indexPath = path.join(process.cwd(), 'templates', 'index.json');
  if (!fs.existsSync(indexPath)) return null;
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const category = index.find((c: any) => c.categoryId === temuCategoryId);
  if (!category) return null;

  // Load category-specific index.json for variants
  const categoryIndexPath = path.join(process.cwd(), 'templates', temuCategoryId, 'index.json');
  if (fs.existsSync(categoryIndexPath)) {
    const categoryIndex = JSON.parse(fs.readFileSync(categoryIndexPath, 'utf8'));
    // Merge: category-specific values override main index
    return { ...category, ...categoryIndex };
  }

  return category;
}

function loadConfig(temuCategoryId: string, type: string) {
  const configPath = path.join(process.cwd(), 'templates', temuCategoryId, `${type.toLowerCase()}.json`);
  if (!fs.existsSync(configPath)) return null;
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = requireAuth(req, res);
  if (!auth) return;

  try {
    const {
      productIds,
      categoryId,         // DB category ID (for filtering products)
      temuCategoryId,     // Temu category ID (e.g., "10585" for Mugs)
      configType = 'CUSTOM',
      skuPrefix = 'CG',    // Prefix for the SKU formula
      customVariants,     // Optional: user-uploaded variants array
      customDescription,  // Optional: user-provided description
    } = req.body || {};

    console.log('[Temu Export] Start process', {
      temuCategoryId,
      configType,
      skuPrefix,
      hasCustomDescription: !!customDescription,
      customDescriptionLength: customDescription?.length,
    });

    if (!temuCategoryId) {
      return badRequest(res, 'temuCategoryId is required (e.g., "10585" for Mugs)');
    }

    if (!productIds && !categoryId) {
      return badRequest(res, 'productIds or categoryId is required');
    }

    // Load Temu config
    const categoryIndex = loadCategoryIndex(temuCategoryId);
    console.log('[Temu Export] Category index loaded:', !!categoryIndex, temuCategoryId);
    
    if (!categoryIndex) {
      return badRequest(res, `No template found for temuCategoryId: ${temuCategoryId}`);
    }

    const config = loadConfig(temuCategoryId, configType);
    console.log('[Temu Export] Config loaded:', !!config, configType);
    
    if (!config) {
      return badRequest(res, `Config type "${configType}" not found for category ${temuCategoryId}. Available: ${categoryIndex.availableConfigs?.join(', ')}`);
    }

    // Use custom variants if provided, otherwise use template variants from index.json
    const useCustom = customVariants && Array.isArray(customVariants) && customVariants.length > 0;
    const variants: any[] = useCustom
      ? customVariants
      : (categoryIndex.variants || []);

    console.log(`[Temu Export] Variants source: ${useCustom ? 'CUSTOM' : 'TEMPLATE'}`);
    console.log(`[Temu Export] Variants count: ${variants.length}`);
    if (!useCustom) {
      console.log(`[Temu Export] Template variants:`, JSON.stringify(variants));
    }

    if (variants.length === 0) {
      return badRequest(res, `No variants defined. Upload a JSON file or check template for temuCategoryId: ${temuCategoryId}`);
    }

    // Fetch products
    let whereClause: any = { teamId: auth.teamId };
    if (categoryId) whereClause.categoryId = categoryId;
    if (Array.isArray(productIds) && productIds.length > 0) {
      whereClause.id = { in: productIds };
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    if (products.length === 0) {
      return badRequest(res, 'No products found matching the criteria');
    }

    // Load Template XLSX
    const templateXlsx = path.join(process.cwd(), 'templates', temuCategoryId, 'template.xlsx');
    const workbook = new Workbook();
    if (fs.existsSync(templateXlsx)) {
      await workbook.xlsx.readFile(templateXlsx);
    }

    let sheet = workbook.getWorksheet('Template');
    if (!sheet) sheet = workbook.addWorksheet('Template');

    // Remove conditional formatting (causes ExcelJS write errors)
    (sheet as any).conditionalFormattings = [];

    // Keep all sheets from template (Instructions, Images, Example, etc.)

    // Write data rows starting from row 5
    let rowIndex = config.start_row || 5;
    let productCounter = 1; // Used for "CG00000x" part
    const imageStartCol = config.images?.start_col
      ? colLetterToIndex(config.images.start_col)
      : null;
    const imageEndCol = config.images?.end_col
      ? colLetterToIndex(config.images.end_col)
      : null;
    const maxImages = Math.min(imageStartCol && imageEndCol ? (imageEndCol - imageStartCol + 1) : 10, 10);

    // Unhide image columns (templates may have them hidden)
    if (imageStartCol && imageEndCol) {
      for (let col = imageStartCol; col <= imageEndCol; col++) {
        const column = sheet.getColumn(col);
        column.hidden = false;
      }
    }

    for (const product of products) {
      const images = Array.isArray(product.images) ? product.images as any[] : [];
      const productName = product.listingTitle || '';
      
      // Use custom description if provided, otherwise use product description, then template description
      const description = customDescription || product.description || categoryIndex.description || '';
      
      // SKU Base for display/calculated result
      const calculatedBaseSku = `${skuPrefix}${String(productCounter).padStart(6, '0')}`;
      productCounter++;

      let variantCounter = 0;
      for (const variant of variants) {
        const option1 = variant.option1 || '';
        const option2 = variant.option2 || '';
        const price = String(variant.price || '');

        // Smart fallback: if template uses {option1} but not {option2}, 
        // and variant has option2 but no option1, use option2 for option1.
        const templateStr = JSON.stringify(config.fixed_columns);
        const templateUsesOption2 = templateStr.includes('{option2}');

        let finalOption1 = option1;
        let finalOption2 = option2;

        if (!templateUsesOption2 && !option1 && option2) {
            finalOption1 = option2;
        }

        // Calculate SKUs based on Excel formulas provided by user
        const variantCount = variants.length;
        
        // Formula for Contribution Goods (M)
        const excelFormulaM = `="${skuPrefix}"&TEXT(ROUNDUP((ROW()-4)/${variantCount},0),"000000")`;
        
        // Formula for Contribution SKU (N)
        const excelFormulaN = `=M${rowIndex}&"-"&COUNTIF($M$5:M${rowIndex},M${rowIndex})-1`;
        
        const sku = `${calculatedBaseSku}-${variantCounter}`;
        variantCounter++;

        const row = sheet.getRow(rowIndex);

        // Apply fixed columns - replace {placeholder} values using safe split/join
        const placeholders = {
          '{product_name}': productName,
          '{product_description}': description,
          '{sku}': sku,
          '{option1}': finalOption1,
          '{option2}': finalOption2,
          '{price}': price
        };

        for (const [col, rawValue] of Object.entries(config.fixed_columns)) {
          let value = String(rawValue);
          for (const [placeholder, val] of Object.entries(placeholders)) {
            value = value.split(placeholder).join(val);
          }
          row.getCell(col).value = value;
        }

        // FORCE write formulas to M and N (Ensures they appear even if not in template JSON)
        row.getCell('M').value = { formula: excelFormulaM, result: calculatedBaseSku };
        row.getCell('N').value = { formula: excelFormulaN, result: sku };

        // Write all product images starting from images.start_col (use column letters for better compatibility)
        if (config.images?.start_col) {
          const imgSlice = images.slice(0, maxImages);
          const startColLetter = config.images.start_col;
          const startColIndex = colLetterToIndex(startColLetter);
          console.log(`[Temu Export] Product ${productName.slice(0,30)}: ${images.length} images, writing ${imgSlice.length} starting at ${startColLetter}`);
          for (let i = 0; i < imgSlice.length; i++) {
            const img = imgSlice[i];
            if (img?.url) {
              const colLetter = indexToColLetter(startColIndex + i);
              row.getCell(colLetter).value = img.url;
            }
          }
        } else {
          console.log(`[Temu Export] WARNING: No images.start_col defined for this config!`);
        }

        rowIndex++;
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `temu-${temuCategoryId}-${configType.toLowerCase()}-${Date.now()}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));

  } catch (err) {
    console.error('Export error:', err);
    return serverError(res, err);
  }
}
