/**
 * Setup script: Copy all template configs to centralized /templates folder
 * Run once: npx tsx scripts/setup-templates.ts
 */
import fs from 'fs';
import path from 'path';

const SOURCE_DIR = 'G:/Tu dong hoa/NH-MEDIA/Telegram Desktop/all_templates';
const TARGET_DIR = 'G:/Tu dong hoa/NH-MEDIA/templates';

// Default variants per category
const CATEGORY_META: Record<string, { productName: string; variants: any[] }> = {
  '9519': {
    productName: 'Egg-Cups',
    variants: [
      { option1: '2-Pack', price: 89 },
      { option1: '4-Pack', price: 109 },
    ],
  },
  '10334': {
    productName: 'Tumblers',
    variants: [
      { option1: 'White', option2: '20OZ', price: 135 },
      { option1: 'Black', option2: '20OZ', price: 135 },
      { option1: 'Pink', option2: '20OZ', price: 135 },
      { option1: 'White', option2: '30OZ', price: 145 },
      { option1: 'Black', option2: '30OZ', price: 145 },
      { option1: 'Pink', option2: '30OZ', price: 145 },
    ],
  },
  '10585': {
    productName: 'Mugs',
    variants: [
      { option1: 'White', option2: '11OZ', price: 105 },
      { option1: 'Black', option2: '11OZ', price: 105 },
      { option1: 'Pink', option2: '11OZ', price: 105 },
      { option1: 'Red', option2: '11OZ', price: 105 },
      { option1: 'Light Blue', option2: '11OZ', price: 105 },
      { option1: 'Yellow', option2: '11OZ', price: 105 },
      { option1: 'White', option2: '15OZ', price: 110 },
      { option1: 'Black', option2: '15OZ', price: 110 },
      { option1: 'Pink', option2: '15OZ', price: 110 },
      { option1: 'Red', option2: '15OZ', price: 110 },
      { option1: 'Light Blue', option2: '15OZ', price: 110 },
      { option1: 'Yellow', option2: '15OZ', price: 110 },
    ],
  },
  '10601': {
    productName: 'Wiskey Glass',
    variants: [
      { option1: '2-Pack', option2: 'Clear', price: 99 },
      { option1: '4-Pack', option2: 'Clear', price: 149 },
    ],
  },
  '11459': {
    productName: 'Table Runner',
    variants: [
      { option1: '14x72 inch', price: 159 },
      { option1: '14x108 inch', price: 189 },
    ],
  },
  '11666': {
    productName: 'Banners',
    variants: [
      { option1: '2x4ft', price: 149 },
      { option1: '3x6ft', price: 199 },
    ],
  },
  '11899': {
    productName: 'Blanket',
    variants: [
      { option1: '30x40 inch', price: 139 },
      { option1: '50x60 inch', price: 169 },
      { option1: '60x80 inch', price: 199 },
    ],
  },
  '12042': {
    productName: 'Pillow',
    variants: [
      { option1: '14x14 inch', price: 99 },
      { option1: '18x18 inch', price: 119 },
      { option1: '20x20 inch', price: 129 },
    ],
  },
  '12141': {
    productName: 'Ornament',
    variants: [
      { option1: 'Round 3 inch', price: 79 },
      { option1: 'Round 4 inch', price: 89 },
    ],
  },
  '12193': {
    productName: 'Acrylic Blocks',
    variants: [
      { option1: '4x4 inch', price: 99 },
      { option1: '4x6 inch', price: 119 },
      { option1: '5x7 inch', price: 139 },
    ],
  },
  '12253': {
    productName: 'Doormat',
    variants: [
      { option1: '18x30 inch', price: 129 },
      { option1: '24x36 inch', price: 169 },
    ],
  },
  '12869': {
    productName: 'Poster',
    variants: [
      { option1: '12x16 inch', price: 89 },
      { option1: '16x20 inch', price: 109 },
      { option1: '18x24 inch', price: 129 },
      { option1: '24x36 inch', price: 159 },
    ],
  },
  '13018': {
    productName: 'Wooden Block',
    variants: [
      { option1: 'Small', price: 99 },
      { option1: 'Large', price: 129 },
    ],
  },
  '17332': {
    productName: 'Wrapping Paper',
    variants: [
      { option1: '3 sheets', price: 79 },
      { option1: '5 sheets', price: 109 },
    ],
  },
  '22120': {
    productName: 'Car Visor Clip',
    variants: [
      { option1: '2-Pack', option2: 'Square', price: 89 },
      { option1: '2-Pack', option2: 'Round', price: 89 },
      { option1: '4-Pack', option2: 'Square', price: 129 },
      { option1: '4-Pack', option2: 'Round', price: 129 },
    ],
  },
  '24376': {
    productName: 'Phone Case',
    variants: [
      { option1: 'iPhone 14', price: 99 },
      { option1: 'iPhone 15', price: 99 },
      { option1: 'iPhone 15 Pro', price: 109 },
      { option1: 'Samsung S23', price: 99 },
      { option1: 'Samsung S24', price: 99 },
    ],
  },
  '24675': {
    productName: 'Flag',
    variants: [
      { option1: '3x5 ft', price: 99 },
      { option1: '4x6 ft', price: 129 },
    ],
  },
  '28924': {
    productName: 'Graduation Stole',
    variants: [
      { option1: 'Gold', price: 109 },
      { option1: 'Silver', price: 109 },
      { option1: 'Blue', price: 109 },
    ],
  },
  '29007': {
    productName: 'Bikini',
    variants: [
      { option1: 'S', price: 149 },
      { option1: 'M', price: 149 },
      { option1: 'L', price: 149 },
      { option1: 'XL', price: 149 },
    ],
  },
  '30152': {
    productName: 'Cap',
    variants: [
      { option1: 'One Size', price: 119 },
    ],
  },
  '30471': {
    productName: 'Hawaiian Shirt',
    variants: [
      { option1: 'S', price: 159 },
      { option1: 'M', price: 159 },
      { option1: 'L', price: 159 },
      { option1: 'XL', price: 159 },
      { option1: '2XL', price: 169 },
      { option1: '3XL', price: 169 },
    ],
  },
  '40381': {
    productName: 'Booktracker',
    variants: [
      { option1: 'One Size', price: 109 },
    ],
  },
};

function extractFromConfigRaw(configPath: string): { categoryId: string; config: any } | null {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const catIdMatch = content.match(/"E":\s*"(\d+)"/);
    if (!catIdMatch) return null;

    const config: any = { fixed_columns: {}, images: {}, start_row: 5 };

    const pairs = content.matchAll(/"([A-Z]+)":\s*"([^"\n]+)"/g);
    for (const [, key, val] of pairs) {
      if (key !== 'start_col' && key !== 'end_col') {
        config.fixed_columns[key] = val;
      }
    }

    const startColMatch = content.match(/"start_col":\s*"([A-Z]+)"/);
    const endColMatch = content.match(/"end_col":\s*"([A-Z]+)"/);
    if (startColMatch) config.images.start_col = startColMatch[1];
    if (endColMatch) config.images.end_col = endColMatch[1];

    return { categoryId: catIdMatch[1], config };
  } catch {
    return null;
  }
}

function findAllConfigs(dir: string): string[] {
  const results: string[] = [];
  function walk(p: string) {
    for (const item of fs.readdirSync(p)) {
      const full = path.join(p, item);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (item.startsWith('config') && item.endsWith('.json')) results.push(full);
    }
  }
  walk(dir);
  return results;
}

async function setup() {
  console.log('Setting up templates...\n');
  fs.mkdirSync(TARGET_DIR, { recursive: true });

  const configFiles = findAllConfigs(SOURCE_DIR);
  console.log(`Found ${configFiles.length} config files\n`);

  const categories: Record<string, { configs: Record<string, any>; xlsxTemplate: string }> = {};

  for (const configPath of configFiles) {
    const result = extractFromConfigRaw(configPath);
    if (!result) continue;

    const { categoryId, config } = result;
    const configName = path.basename(configPath, '.json');

    let configType = 'NORMAL';
    if (configName.toLowerCase().includes('custom') && configName.toLowerCase().includes('pack')) {
      configType = 'PACK_CUSTOM';
    } else if (configName.toLowerCase().includes('custom')) {
      configType = 'CUSTOM';
    } else if (configName.toLowerCase().includes('pack')) {
      configType = 'PACK';
    }

    if (!categories[categoryId]) {
      // Find xlsx in same folder
      const configDir = path.dirname(configPath);
      const xlsxFile = fs.readdirSync(configDir).find(f => f.endsWith('.xlsx') && !f.startsWith('~'));
      categories[categoryId] = {
        configs: {},
        xlsxTemplate: xlsxFile ? path.join(configDir, xlsxFile) : ''
      };
    }

    // Don't overwrite existing config type
    if (!categories[categoryId].configs[configType]) {
      categories[categoryId].configs[configType] = config;
    }
  }

  for (const [catId, data] of Object.entries(categories)) {
    const catDir = path.join(TARGET_DIR, catId);
    fs.mkdirSync(catDir, { recursive: true });

    const meta = CATEGORY_META[catId] || { productName: catId, variants: [] };

    // Write index.json with variants
    fs.writeFileSync(path.join(catDir, 'index.json'), JSON.stringify({
      categoryId: catId,
      productName: meta.productName,
      variants: meta.variants,
      availableConfigs: Object.keys(data.configs)
    }, null, 2));

    // Write each config
    for (const [type, config] of Object.entries(data.configs)) {
      fs.writeFileSync(
        path.join(catDir, `${type.toLowerCase()}.json`),
        JSON.stringify(config, null, 2)
      );
    }

    // Copy xlsx
    if (data.xlsxTemplate && fs.existsSync(data.xlsxTemplate)) {
      fs.copyFileSync(data.xlsxTemplate, path.join(catDir, 'template.xlsx'));
    }

    console.log(`[${catId}] ${meta.productName} - ${Object.keys(data.configs).join(', ')}`);
  }

  // Master index
  const masterIndex = Object.entries(categories).map(([id]) => {
    const meta = CATEGORY_META[id] || { productName: id, variants: [] };
    return {
      categoryId: id,
      productName: meta.productName,
      configs: Object.keys(categories[id].configs)
    };
  }).sort((a, b) => parseInt(a.categoryId) - parseInt(b.categoryId));

  fs.writeFileSync(path.join(TARGET_DIR, 'index.json'), JSON.stringify(masterIndex, null, 2));

  console.log(`\n✅ Done: ${Object.keys(categories).length} categories`);
}

setup().catch(console.error);
