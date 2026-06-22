import { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { categoryId } = req.query;

  if (!categoryId || typeof categoryId !== 'string') {
    return res.status(400).json({ error: 'categoryId query parameter is required' });
  }

  try {
    // Load main index
    const mainIndexPath = path.join(process.cwd(), 'templates', 'index.json');
    if (!fs.existsSync(mainIndexPath)) {
      return res.status(404).json({ error: 'Templates index not found' });
    }

    const mainIndex = JSON.parse(fs.readFileSync(mainIndexPath, 'utf8'));
    const category = mainIndex.find((c: any) => c.categoryId === categoryId);

    if (!category) {
      return res.status(404).json({ error: `Category ${categoryId} not found` });
    }

    // Load category-specific index.json for description and variants
    const categoryIndexPath = path.join(process.cwd(), 'templates', categoryId, 'index.json');
    if (fs.existsSync(categoryIndexPath)) {
      const categoryIndex = JSON.parse(fs.readFileSync(categoryIndexPath, 'utf8'));
      // Merge: category-specific values override main index
      return res.status(200).json({ ...category, ...categoryIndex });
    }

    return res.status(200).json(category);
  } catch (err) {
    console.error('Error loading template index:', err);
    return res.status(500).json({ error: 'Failed to load template' });
  }
}
