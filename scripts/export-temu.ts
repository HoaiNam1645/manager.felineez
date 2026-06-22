#!/usr/bin/env npx tsx
/**
 * Temu Export Script - Export products using config files
 *
 * Usage:
 *   npx tsx scripts/export-temu.ts --category 10585 --type CUSTOM --products "id1,id2"
 *   npx tsx scripts/export-temu.ts --category 10585 --type CUSTOM --all
 *   npx tsx scripts/export-temu.ts --list  # List all categories
 *
 * Options:
 *   --category, -c   Category ID (e.g., 10585 for Mugs)
 *   --type, -t       Config type: NORMAL, CUSTOM, PACK, PACK_CUSTOM
 *   --products, -p   Comma-separated product IDs
 *   --all, -a        Export all products in category
 *   --output, -o     Output file path (default: ./exports/temu-{category}-{type}-{timestamp}.xlsx)
 *   --list, -l       List all available categories
 */

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const TEMPLATES_DIR = 'G:/Tu dong hoa/NH-MEDIA/templates';

// Parse CLI arguments
function parseArgs(): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }

  return args;
}

async function listCategories() {
  const indexPath = path.join(TEMPLATES_DIR, 'index.json');
  if (!fs.existsSync(indexPath)) {
    console.log('❌ Templates not set up. Run: npx tsx scripts/setup-templates.ts');
    return;
  }

  const categories = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  console.log('\n📋 Available Categories:\n');
  console.log('ID'.padEnd(8) + 'Name'.padEnd(25) + 'Configs');
  console.log('-'.repeat(60));

  for (const cat of categories) {
    console.log(
      cat.categoryId.padEnd(8) +
      cat.productName.slice(0, 23).padEnd(25) +
      cat.configs.join(', ')
    );
  }
  console.log('');
}

async function loadConfig(categoryId: string, configType: string) {
  const configPath = path.join(TEMPLATES_DIR, categoryId, `${configType.toLowerCase()}.json`);

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}`);
  }

  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

async function loadTemplate(categoryId: string) {
  const templatePath = path.join(TEMPLATES_DIR, categoryId, 'template.xlsx');

  if (!fs.existsSync(templatePath)) {
    return null;
  }

  const { Workbook } = await import('../api/_lib/excel.js');
  const workbook = new Workbook();
  await workbook.xlsx.readFile(templatePath);
  return workbook;
}

// Column letter to index conversion
function colLetterToIndex(col: string): number {
  let index = 0;
  for (let i = 0; i < col.length; i++) {
    index = index * 26 + (col.charCodeAt(i) - 64);
  }
  return index;
}

async function exportProducts(
  categoryId: string,
  configType: string,
  productIds: string[],
  outputPath: string
) {
  console.log(`\n🚀 Exporting...`);
  console.log(`   Category: ${categoryId}`);
  console.log(`   Type: ${configType}`);
  console.log(`   Products: ${productIds.length > 0 ? productIds.length : 'ALL'}`);

  // Load config
  const config = await loadConfig(categoryId, configType);
  console.log(`   ✓ Config loaded`);

  // Load template
  let workbook = await loadTemplate(categoryId);
  const { Workbook } = await import('../api/_lib/excel.js');

  if (!workbook) {
    workbook = new Workbook();
    workbook.addWorksheet('Template');
    console.log(`   ⚠ No template, creating empty workbook`);
  } else {
    console.log(`   ✓ Template loaded`);
  }

  // Get sheet
  let sheet = workbook.getWorksheet('Template');
  if (!sheet) {
    sheet = workbook.addWorksheet('Template');
  }

  // Remove conditional formatting to avoid errors
  (sheet as any).conditionalFormattings = [];

  // Fetch products from database
  const prisma = new PrismaClient();

  try {
    const whereClause: any = {};
    if (productIds.length > 0) {
      whereClause.id = { in: productIds };
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: productIds.length > 0 ? undefined : 100 // Limit if fetching all
    });

    console.log(`   ✓ Found ${products.length} products`);

    if (products.length === 0) {
      console.log('   ❌ No products found');
      return;
    }

    // Default variants
    const variants = [
      { color: 'White', size: '11OZ', price: 105 },
      { color: 'Black', size: '11OZ', price: 105 },
      { color: 'Pink', size: '11OZ', price: 105 },
      { color: 'White', size: '15OZ', price: 110 },
      { color: 'Black', size: '15OZ', price: 110 },
      { color: 'Pink', size: '15OZ', price: 110 },
    ];

    let rowIndex = config.start_row || 5;

    for (const product of products) {
      const images = Array.isArray(product.images) ? product.images : [];
      const productName = product.listingTitle || product.title || 'Untitled';
      const description = product.description || '';
      const baseSku = product.title?.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 20) || `prod-${product.id.slice(0, 8)}`;

      for (const variant of variants) {
        const sku = `${baseSku}-${variant.color.toLowerCase()}-${variant.size.toLowerCase()}`;
        const row = sheet.getRow(rowIndex);

        // Apply fixed columns
        for (const [col, value] of Object.entries(config.fixed_columns || {})) {
          let finalValue = value as string;

          // Replace placeholders
          finalValue = finalValue
            .replace('{product_name}', productName)
            .replace('{product_description}', description)
            .replace('{sku}', sku)
            .replace('{option1}', variant.color)
            .replace('{option2}', variant.size)
            .replace('{price}', String(variant.price));

          row.getCell(col).value = finalValue;
        }

        // Add images
        if (config.images?.start_col) {
          const startCol = colLetterToIndex(config.images.start_col);
          images.slice(0, 10).forEach((img: any, i: number) => {
            if (img?.url) {
              row.getCell(startCol + i).value = img.url;
            }
          });
        }

        rowIndex++;
      }
    }

    // Remove other sheets
    workbook.eachSheet((s: any, id: number) => {
      if (s.name !== 'Template') {
        workbook.removeWorksheet(id);
      }
    });

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });

    // Write file
    await workbook.xlsx.writeFile(outputPath);
    console.log(`\n✅ Exported to: ${outputPath}`);
    console.log(`   Total rows: ${rowIndex - (config.start_row || 5)}`);

  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const args = parseArgs();

  // Handle aliases
  const category = (args.category || args.c) as string;
  const configType = ((args.type || args.t) as string || 'CUSTOM').toUpperCase();
  const productsArg = (args.products || args.p) as string;
  const outputPath = (args.output || args.o) as string;
  const listFlag = args.list || args.l;
  const allFlag = args.all || args.a;

  if (listFlag) {
    await listCategories();
    return;
  }

  if (!category) {
    console.log('Usage: npx tsx scripts/export-temu.ts --category <ID> --type <TYPE> [--products <IDs>] [--all]');
    console.log('       npx tsx scripts/export-temu.ts --list');
    return;
  }

  const productIds = productsArg ? productsArg.split(',').map(s => s.trim()) : [];

  const finalOutput = outputPath ||
    `G:/Tu dong hoa/NH-MEDIA/exports/temu-${category}-${configType.toLowerCase()}-${Date.now()}.xlsx`;

  await exportProducts(category, configType, productIds, finalOutput);
}

main().catch(console.error);
