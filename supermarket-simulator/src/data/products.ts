// Product catalog. All brands are fictional.

export type DisplayKind = 'shelf' | 'fridge' | 'freezer' | 'produce' | 'bakery' | 'meat' | 'fish';

export type Shape =
  | 'apple' | 'orange' | 'lemon' | 'tomato' | 'onion' | 'potatoBag' | 'avocado' | 'pear' | 'banana' | 'carrot'
  | 'cucumber' | 'pepper' | 'broccoli' | 'lettuce' | 'grapes' | 'watermelon' | 'pineapple' | 'berries'
  | 'box' | 'can' | 'bottle' | 'carton' | 'jar' | 'bag' | 'tub' | 'tray' | 'loaf' | 'baguette' | 'croissant'
  | 'buns' | 'donut' | 'roll' | 'muffin' | 'eggs' | 'cheese' | 'tp' | 'spray' | 'flowers' | 'plant' | 'ball'
  | 'teddy' | 'mug' | 'pan' | 'folded' | 'cup' | 'bar' | 'blister' | 'fish' | 'butter';

export type Icon =
  | 'apple' | 'orange' | 'banana' | 'bread' | 'milk' | 'cereal' | 'chips' | 'drop' | 'bubbles' | 'cow' | 'cheese'
  | 'fish' | 'meat' | 'pizza' | 'icecream' | 'coffee' | 'leaf' | 'candy' | 'choco' | 'cookie' | 'pasta' | 'rice'
  | 'tomato' | 'sparkle' | 'star' | 'heart' | 'egg' | 'sun' | 'bolt' | 'snow' | 'paw' | 'baby' | 'flower'
  | 'battery' | 'note' | 'wheat' | 'bee' | 'berry' | 'pepper' | 'chicken' | 'sausage' | 'tooth' | 'shirt' | 'cup'
  | 'lemon' | 'pea' | 'fries' | 'shrimp' | 'beer' | 'apple2' | 'flame' | 'drink' | 'nut' | 'oat' | 'jar' | 'can';

export interface ProductDef {
  id: string;
  name: string;
  category: CategoryId;
  display: DisplayKind[];
  shape: Shape;
  /** Item dimensions in meters [w, h, d] */
  dims: [number, number, number];
  color: string;
  color2: string;
  label: string;
  icon: Icon;
  cost: number;
  price: number;
  perBox: number;
  level: number;
  shelfLife: number;
  popularity: number;
}

export type CategoryId =
  | 'produce' | 'bakery' | 'dairy' | 'drinks' | 'snacks' | 'pantry' | 'frozen' | 'meat' | 'fish'
  | 'household' | 'personal' | 'alcohol' | 'pets' | 'baby' | 'home' | 'electronics' | 'toys' | 'clothing' | 'kitchen';

export interface CategoryDef {
  id: CategoryId;
  name: string;
  /** license needed to sell (null = available from start) */
  license: { level: number; cost: number; name: string } | null;
  aisle: string;
  color: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'produce', name: 'Fruits & Vegetables', license: null, aisle: 'FRESH PRODUCE', color: '#4caf50' },
  { id: 'pantry', name: 'Pantry', license: null, aisle: 'PANTRY', color: '#ff9800' },
  { id: 'snacks', name: 'Snacks & Sweets', license: null, aisle: 'SNACKS', color: '#e91e63' },
  { id: 'drinks', name: 'Drinks', license: { level: 2, cost: 60, name: 'Beverage Permit' }, aisle: 'DRINKS', color: '#2196f3' },
  { id: 'bakery', name: 'Bakery', license: { level: 3, cost: 120, name: 'Bakery Permit' }, aisle: 'BAKERY', color: '#a1662f' },
  { id: 'dairy', name: 'Dairy & Chilled', license: { level: 4, cost: 200, name: 'Chilled Food License' }, aisle: 'DAIRY', color: '#90caf9' },
  { id: 'frozen', name: 'Frozen Food', license: { level: 6, cost: 350, name: 'Frozen Food License' }, aisle: 'FROZEN', color: '#4dd0e1' },
  { id: 'household', name: 'Household & Cleaning', license: { level: 9, cost: 400, name: 'Household Goods License' }, aisle: 'HOUSEHOLD', color: '#7e57c2' },
  { id: 'personal', name: 'Health & Beauty', license: { level: 16, cost: 900, name: 'Cosmetics License' }, aisle: 'HEALTH & BEAUTY', color: '#f06292' },
  { id: 'meat', name: 'Meat', license: { level: 21, cost: 1500, name: 'Fresh Meat Permit' }, aisle: 'MEAT', color: '#d32f2f' },
  { id: 'fish', name: 'Fish & Seafood', license: { level: 26, cost: 1800, name: 'Seafood Permit' }, aisle: 'SEAFOOD', color: '#0288d1' },
  { id: 'alcohol', name: 'Beer & Cider', license: { level: 30, cost: 3000, name: 'Alcohol License' }, aisle: 'BEER & CIDER', color: '#f9a825' },
  { id: 'pets', name: 'Pet Supplies', license: { level: 36, cost: 2500, name: 'Pet Supplies License' }, aisle: 'PETS', color: '#8d6e63' },
  { id: 'baby', name: 'Baby', license: { level: 44, cost: 3500, name: 'Baby Care License' }, aisle: 'BABY', color: '#81d4fa' },
  { id: 'home', name: 'Home & Garden', license: { level: 55, cost: 5000, name: 'Home & Garden License' }, aisle: 'HOME & GARDEN', color: '#66bb6a' },
  { id: 'kitchen', name: 'Kitchenware', license: { level: 68, cost: 7000, name: 'Kitchenware License' }, aisle: 'KITCHEN', color: '#78909c' },
  { id: 'electronics', name: 'Electronics', license: { level: 82, cost: 12000, name: 'Electronics License' }, aisle: 'ELECTRONICS', color: '#455a64' },
  { id: 'toys', name: 'Toys', license: { level: 98, cost: 15000, name: 'Toy Store License' }, aisle: 'TOYS', color: '#ffb300' },
  { id: 'clothing', name: 'Clothing', license: { level: 118, cost: 20000, name: 'Apparel License' }, aisle: 'CLOTHING', color: '#5c6bc0' },
];

export const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.id, c]));

type P = Omit<ProductDef, 'popularity' | 'label' | 'color2'> & Partial<Pick<ProductDef, 'popularity' | 'label' | 'color2'>>;

const RAW: P[] = [
  // ---------------- Fruits & vegetables ----------------
  { id: 'apple', name: "Adam's Apples", category: 'produce', display: ['produce'], shape: 'apple', dims: [0.085, 0.085, 0.085], color: '#d32f2f', icon: 'apple', cost: 0.3, price: 0.59, perBox: 12, level: 1, shelfLife: 9, popularity: 1.6 },
  { id: 'orange', name: 'Spanish Oranges', category: 'produce', display: ['produce'], shape: 'orange', dims: [0.09, 0.09, 0.09], color: '#f57c00', icon: 'orange', cost: 0.28, price: 0.55, perBox: 12, level: 1, shelfLife: 12, popularity: 1.3 },
  { id: 'banana', name: 'Banana Bunch', category: 'produce', display: ['produce'], shape: 'banana', dims: [0.2, 0.1, 0.14], color: '#fdd835', icon: 'banana', cost: 0.85, price: 1.59, perBox: 8, level: 1, shelfLife: 6, popularity: 1.7 },
  { id: 'avocado', name: 'Hass Avocados', category: 'produce', display: ['produce'], shape: 'avocado', dims: [0.08, 0.1, 0.08], color: '#33691e', icon: 'leaf', cost: 0.6, price: 1.19, perBox: 12, level: 2, shelfLife: 6, popularity: 0.9 },
  { id: 'tomato', name: 'Vine Tomatoes', category: 'produce', display: ['produce'], shape: 'tomato', dims: [0.08, 0.07, 0.08], color: '#e53935', icon: 'tomato', cost: 0.22, price: 0.49, perBox: 16, level: 2, shelfLife: 7, popularity: 1.3 },
  { id: 'lemon', name: 'Zesty Lemons', category: 'produce', display: ['produce'], shape: 'lemon', dims: [0.07, 0.07, 0.09], color: '#fbc02d', icon: 'lemon', cost: 0.2, price: 0.45, perBox: 16, level: 3, shelfLife: 14, popularity: 0.8 },
  { id: 'potato', name: 'Golden Potatoes 2kg', category: 'produce', display: ['produce', 'shelf'], shape: 'potatoBag', dims: [0.22, 0.12, 0.3], color: '#c8a26b', color2: '#7b5e3b', label: '#6d4c2c', icon: 'wheat', cost: 1.2, price: 2.49, perBox: 6, level: 3, shelfLife: 20, popularity: 1.2 },
  { id: 'onion', name: 'Red Onions', category: 'produce', display: ['produce'], shape: 'onion', dims: [0.08, 0.08, 0.08], color: '#8e244d', icon: 'leaf', cost: 0.18, price: 0.42, perBox: 16, level: 4, shelfLife: 25, popularity: 0.9 },
  { id: 'carrot', name: 'Crunchy Carrots', category: 'produce', display: ['produce'], shape: 'carrot', dims: [0.1, 0.06, 0.24], color: '#ef6c00', icon: 'leaf', cost: 0.5, price: 1.09, perBox: 12, level: 5, shelfLife: 14, popularity: 1.0 },
  { id: 'cucumber', name: 'Garden Cucumber', category: 'produce', display: ['produce'], shape: 'cucumber', dims: [0.06, 0.06, 0.26], color: '#2e7d32', icon: 'leaf', cost: 0.35, price: 0.79, perBox: 12, level: 6, shelfLife: 8, popularity: 1.0 },
  { id: 'pepper', name: 'Red Bell Pepper', category: 'produce', display: ['produce'], shape: 'pepper', dims: [0.09, 0.1, 0.09], color: '#c62828', icon: 'pepper', cost: 0.45, price: 0.99, perBox: 12, level: 7, shelfLife: 9, popularity: 0.8 },
  { id: 'pear', name: 'Conference Pears', category: 'produce', display: ['produce'], shape: 'pear', dims: [0.08, 0.12, 0.08], color: '#9ccc65', icon: 'leaf', cost: 0.33, price: 0.69, perBox: 12, level: 8, shelfLife: 8, popularity: 0.7 },
  { id: 'grapes', name: 'Sweet Grapes', category: 'produce', display: ['produce'], shape: 'grapes', dims: [0.13, 0.08, 0.18], color: '#6a1b9a', icon: 'berry', cost: 1.4, price: 2.79, perBox: 8, level: 10, shelfLife: 6, popularity: 0.9 },
  { id: 'broccoli', name: 'Fresh Broccoli', category: 'produce', display: ['produce'], shape: 'broccoli', dims: [0.13, 0.15, 0.13], color: '#2e7d32', icon: 'leaf', cost: 0.65, price: 1.39, perBox: 8, level: 11, shelfLife: 6, popularity: 0.7 },
  { id: 'lettuce', name: 'Iceberg Lettuce', category: 'produce', display: ['produce'], shape: 'lettuce', dims: [0.15, 0.13, 0.15], color: '#8bc34a', icon: 'leaf', cost: 0.55, price: 1.19, perBox: 8, level: 13, shelfLife: 6, popularity: 0.8 },
  { id: 'strawberry', name: 'Strawberry Punnet', category: 'produce', display: ['produce', 'fridge'], shape: 'berries', dims: [0.14, 0.07, 0.1], color: '#e53935', icon: 'berry', label: '#2e7d32', cost: 1.6, price: 3.29, perBox: 8, level: 15, shelfLife: 4, popularity: 1.0 },
  { id: 'pineapple', name: 'Tropical Pineapple', category: 'produce', display: ['produce'], shape: 'pineapple', dims: [0.14, 0.3, 0.14], color: '#c9a227', icon: 'sun', cost: 1.5, price: 2.99, perBox: 6, level: 18, shelfLife: 8, popularity: 0.6 },
  { id: 'watermelon', name: 'Giant Watermelon', category: 'produce', display: ['produce'], shape: 'watermelon', dims: [0.28, 0.22, 0.34], color: '#2e7d32', icon: 'sun', cost: 2.4, price: 4.79, perBox: 4, level: 24, shelfLife: 10, popularity: 0.6 },
  { id: 'greenapple', name: "Granny's Green Apples", category: 'produce', display: ['produce'], shape: 'apple', dims: [0.085, 0.085, 0.085], color: '#7cb342', icon: 'apple2', cost: 0.32, price: 0.65, perBox: 12, level: 34, shelfLife: 10, popularity: 0.8 },

  // ---------------- Pantry ----------------
  { id: 'cereal', name: 'Fruity Bites', category: 'pantry', display: ['shelf'], shape: 'box', dims: [0.19, 0.28, 0.07], color: '#29b6f6', color2: '#ffeb3b', label: '#1e88e5', icon: 'cereal', cost: 1.2, price: 3.29, perBox: 12, level: 1, shelfLife: 0, popularity: 1.2 },
  { id: 'pasta', name: 'Bella Pasta Penne', category: 'pantry', display: ['shelf'], shape: 'box', dims: [0.16, 0.2, 0.07], color: '#1565c0', color2: '#ffffff', label: '#0d47a1', icon: 'pasta', cost: 0.5, price: 1.29, perBox: 18, level: 1, shelfLife: 0, popularity: 1.2 },
  { id: 'sugar', name: 'Kane Sugar 1kg', category: 'pantry', display: ['shelf'], shape: 'bag', dims: [0.12, 0.18, 0.08], color: '#fafafa', color2: '#1e88e5', label: '#ffffff', icon: 'sparkle', cost: 0.6, price: 1.39, perBox: 12, level: 2, shelfLife: 0, popularity: 0.8 },
  { id: 'rice', name: 'Jasmine Rice 1kg', category: 'pantry', display: ['shelf'], shape: 'bag', dims: [0.13, 0.2, 0.08], color: '#f5f5dc', color2: '#c62828', label: '#fff8e1', icon: 'rice', cost: 0.9, price: 2.19, perBox: 12, level: 2, shelfLife: 0, popularity: 1.0 },
  { id: 'flour', name: 'Miller Wheat Flour', category: 'pantry', display: ['shelf'], shape: 'bag', dims: [0.13, 0.22, 0.08], color: '#fff3e0', color2: '#8d6e63', label: '#fffde7', icon: 'wheat', cost: 0.5, price: 1.19, perBox: 12, level: 3, shelfLife: 0, popularity: 0.7 },
  { id: 'coffee', name: 'Dream Cafe Coffee', category: 'pantry', display: ['shelf'], shape: 'bag', dims: [0.11, 0.2, 0.07], color: '#4e342e', color2: '#ffca28', label: '#3e2723', icon: 'coffee', cost: 2.4, price: 5.49, perBox: 12, level: 3, shelfLife: 0, popularity: 1.3 },
  { id: 'tomsauce', name: "Nonna's Tomato Sauce", category: 'pantry', display: ['shelf'], shape: 'jar', dims: [0.08, 0.13, 0.08], color: '#c62828', color2: '#2e7d32', label: '#fff8e1', icon: 'tomato', cost: 0.8, price: 1.99, perBox: 12, level: 4, shelfLife: 0, popularity: 0.9 },
  { id: 'beans', name: 'Bean Feast', category: 'pantry', display: ['shelf'], shape: 'can', dims: [0.075, 0.11, 0.075], color: '#43a047', color2: '#ffffff', label: '#2e7d32', icon: 'pea', cost: 0.38, price: 0.99, perBox: 24, level: 4, shelfLife: 0, popularity: 0.8 },
  { id: 'tea', name: "Earl's Black Tea", category: 'pantry', display: ['shelf'], shape: 'box', dims: [0.15, 0.08, 0.07], color: '#00695c', color2: '#ffd54f', label: '#004d40', icon: 'leaf', cost: 1.0, price: 2.49, perBox: 18, level: 5, shelfLife: 0, popularity: 0.7 },
  { id: 'oats', name: 'Morning Oats', category: 'pantry', display: ['shelf'], shape: 'box', dims: [0.17, 0.25, 0.07], color: '#d7a86e', color2: '#5d4037', label: '#a1887f', icon: 'oat', cost: 0.9, price: 2.19, perBox: 12, level: 5, shelfLife: 0, popularity: 0.8 },
  { id: 'soup', name: 'Hearty Tomato Soup', category: 'pantry', display: ['shelf'], shape: 'can', dims: [0.075, 0.1, 0.075], color: '#d84315', color2: '#ffffff', label: '#bf360c', icon: 'tomato', cost: 0.6, price: 1.49, perBox: 24, level: 6, shelfLife: 0, popularity: 0.7 },
  { id: 'cornflakes', name: 'Golden Flakes', category: 'pantry', display: ['shelf'], shape: 'box', dims: [0.2, 0.3, 0.07], color: '#ffb300', color2: '#d84315', label: '#ff8f00', icon: 'sun', cost: 1.1, price: 2.89, perBox: 12, level: 7, shelfLife: 0, popularity: 1.0 },
  { id: 'spaghetti', name: 'Bella Spaghetti', category: 'pantry', display: ['shelf'], shape: 'box', dims: [0.08, 0.27, 0.04], color: '#0d47a1', color2: '#ffffff', label: '#1565c0', icon: 'pasta', cost: 0.45, price: 1.19, perBox: 24, level: 8, shelfLife: 0, popularity: 1.0 },
  { id: 'ketchup', name: 'Ruby Ketchup', category: 'pantry', display: ['shelf'], shape: 'bottle', dims: [0.07, 0.2, 0.05], color: '#b71c1c', color2: '#ffffff', label: '#ffffff', icon: 'tomato', cost: 0.8, price: 1.99, perBox: 12, level: 9, shelfLife: 0, popularity: 0.8 },
  { id: 'noodles', name: 'Quick Noodle Cup', category: 'pantry', display: ['shelf'], shape: 'cup', dims: [0.09, 0.1, 0.09], color: '#ff7043', color2: '#ffffff', label: '#ffffff', icon: 'pasta', cost: 0.3, price: 0.89, perBox: 24, level: 10, shelfLife: 0, popularity: 0.9 },
  { id: 'jam', name: 'Berry Jam', category: 'pantry', display: ['shelf'], shape: 'jar', dims: [0.075, 0.1, 0.075], color: '#880e4f', color2: '#e91e63', label: '#fce4ec', icon: 'berry', cost: 1.0, price: 2.49, perBox: 12, level: 12, shelfLife: 0, popularity: 0.7 },
  { id: 'tuna', name: 'Ocean Tuna', category: 'pantry', display: ['shelf'], shape: 'can', dims: [0.085, 0.045, 0.085], color: '#0277bd', color2: '#ffffff', label: '#01579b', icon: 'fish', cost: 0.7, price: 1.69, perBox: 24, level: 14, shelfLife: 0, popularity: 0.8 },
  { id: 'oil', name: 'Olivia Olive Oil', category: 'pantry', display: ['shelf'], shape: 'bottle', dims: [0.07, 0.27, 0.07], color: '#827717', color2: '#c0ca33', label: '#f9fbe7', icon: 'leaf', cost: 2.5, price: 5.49, perBox: 12, level: 17, shelfLife: 0, popularity: 0.6 },
  { id: 'honey', name: 'Busy Bee Honey', category: 'pantry', display: ['shelf'], shape: 'jar', dims: [0.08, 0.11, 0.08], color: '#ffa000', color2: '#5d4037', label: '#fff8e1', icon: 'bee', cost: 2.0, price: 4.29, perBox: 12, level: 20, shelfLife: 0, popularity: 0.5 },
  { id: 'pbutter', name: 'Nutty Peanut Butter', category: 'pantry', display: ['shelf'], shape: 'jar', dims: [0.08, 0.11, 0.08], color: '#8d6e63', color2: '#d84315', label: '#efebe9', icon: 'nut', cost: 1.4, price: 3.19, perBox: 12, level: 25, shelfLife: 0, popularity: 0.6 },
  { id: 'mustard', name: 'Dijon Gold Mustard', category: 'pantry', display: ['shelf'], shape: 'bottle', dims: [0.06, 0.17, 0.05], color: '#f9a825', color2: '#5d4037', label: '#fffde7', icon: 'star', cost: 0.7, price: 1.79, perBox: 12, level: 31, shelfLife: 0, popularity: 0.5 },

  // ---------------- Snacks ----------------
  { id: 'chips', name: 'Crunchy Chips', category: 'snacks', display: ['shelf'], shape: 'bag', dims: [0.18, 0.25, 0.07], color: '#fdd835', color2: '#d32f2f', label: '#f9a825', icon: 'chips', cost: 0.7, price: 1.79, perBox: 12, level: 1, shelfLife: 0, popularity: 1.4 },
  { id: 'choco', name: 'Choco Joy Bar', category: 'snacks', display: ['shelf'], shape: 'bar', dims: [0.15, 0.025, 0.06], color: '#5d4037', color2: '#ffd54f', label: '#4e342e', icon: 'choco', cost: 0.4, price: 1.19, perBox: 36, level: 2, shelfLife: 0, popularity: 1.3 },
  { id: 'cookies', name: "Grandma's Cookies", category: 'snacks', display: ['shelf'], shape: 'box', dims: [0.2, 0.06, 0.1], color: '#6d4c41', color2: '#ffcc80', label: '#a1887f', icon: 'cookie', cost: 0.9, price: 2.29, perBox: 18, level: 3, shelfLife: 0, popularity: 1.0 },
  { id: 'gummies', name: 'Fruity Gums', category: 'snacks', display: ['shelf'], shape: 'bag', dims: [0.13, 0.17, 0.05], color: '#e91e63', color2: '#ffeb3b', label: '#ad1457', icon: 'candy', cost: 0.6, price: 1.49, perBox: 18, level: 4, shelfLife: 0, popularity: 1.0 },
  { id: 'paprikachips', name: 'Crunchy Paprika', category: 'snacks', display: ['shelf'], shape: 'bag', dims: [0.18, 0.25, 0.07], color: '#e64a19', color2: '#ffeb3b', label: '#bf360c', icon: 'pepper', cost: 0.7, price: 1.79, perBox: 12, level: 6, shelfLife: 0, popularity: 1.0 },
  { id: 'licorice', name: 'Salty Licorice', category: 'snacks', display: ['shelf'], shape: 'bag', dims: [0.12, 0.17, 0.05], color: '#212121', color2: '#ffffff', label: '#000000', icon: 'star', cost: 0.7, price: 1.69, perBox: 18, level: 8, shelfLife: 0, popularity: 0.7 },
  { id: 'popcorn', name: 'Pop Pop Popcorn', category: 'snacks', display: ['shelf'], shape: 'box', dims: [0.14, 0.18, 0.05], color: '#d32f2f', color2: '#ffffff', label: '#c62828', icon: 'star', cost: 0.6, price: 1.59, perBox: 18, level: 11, shelfLife: 0, popularity: 0.7 },
  { id: 'pretzels', name: 'Twisty Pretzels', category: 'snacks', display: ['shelf'], shape: 'bag', dims: [0.15, 0.22, 0.06], color: '#8d6e63', color2: '#ffffff', label: '#5d4037', icon: 'wheat', cost: 0.65, price: 1.69, perBox: 12, level: 15, shelfLife: 0, popularity: 0.6 },
  { id: 'nuts', name: 'Mixed Nuts', category: 'snacks', display: ['shelf'], shape: 'jar', dims: [0.09, 0.12, 0.09], color: '#a1887f', color2: '#2e7d32', label: '#efebe9', icon: 'nut', cost: 1.8, price: 3.99, perBox: 12, level: 19, shelfLife: 0, popularity: 0.6 },

  // ---------------- Drinks ----------------
  { id: 'water', name: 'Pure Spring Water', category: 'drinks', display: ['shelf', 'fridge'], shape: 'bottle', dims: [0.065, 0.22, 0.065], color: '#81d4fa', color2: '#0288d1', label: '#e1f5fe', icon: 'drop', cost: 0.15, price: 0.59, perBox: 24, level: 2, shelfLife: 0, popularity: 1.5 },
  { id: 'cola', name: 'Fizzy Cola', category: 'drinks', display: ['shelf', 'fridge'], shape: 'can', dims: [0.066, 0.122, 0.066], color: '#c62828', color2: '#ffffff', label: '#b71c1c', icon: 'bubbles', cost: 0.3, price: 0.99, perBox: 24, level: 2, shelfLife: 0, popularity: 1.5 },
  { id: 'lemonsoda', name: 'Citrus Splash', category: 'drinks', display: ['shelf', 'fridge'], shape: 'can', dims: [0.066, 0.122, 0.066], color: '#c0ca33', color2: '#ffffff', label: '#9e9d24', icon: 'lemon', cost: 0.3, price: 0.99, perBox: 24, level: 3, shelfLife: 0, popularity: 1.0 },
  { id: 'bigsoda', name: 'Fizzy Cola 1.5L', category: 'drinks', display: ['shelf', 'fridge'], shape: 'bottle', dims: [0.09, 0.32, 0.09], color: '#4e1a1a', color2: '#c62828', label: '#c62828', icon: 'bubbles', cost: 0.6, price: 1.69, perBox: 8, level: 5, shelfLife: 0, popularity: 1.0 },
  { id: 'energy', name: 'Voltage Energy', category: 'drinks', display: ['shelf', 'fridge'], shape: 'can', dims: [0.058, 0.155, 0.058], color: '#212121', color2: '#76ff03', label: '#1b1b1b', icon: 'bolt', cost: 0.6, price: 1.99, perBox: 24, level: 7, shelfLife: 0, popularity: 1.0 },
  { id: 'applejuice', name: 'Orchard Apple Juice', category: 'drinks', display: ['shelf', 'fridge'], shape: 'carton', dims: [0.07, 0.2, 0.07], color: '#9ccc65', color2: '#d32f2f', label: '#f1f8e9', icon: 'apple', cost: 0.7, price: 1.79, perBox: 12, level: 9, shelfLife: 0, popularity: 0.8 },
  { id: 'icedtea', name: 'Chill Iced Tea', category: 'drinks', display: ['shelf', 'fridge'], shape: 'bottle', dims: [0.065, 0.22, 0.065], color: '#bf8f4a', color2: '#ffeb3b', label: '#ff8f00', icon: 'leaf', cost: 0.45, price: 1.39, perBox: 12, level: 12, shelfLife: 0, popularity: 0.8 },
  { id: 'sparkling', name: 'Bubbly Sparkling Water', category: 'drinks', display: ['shelf', 'fridge'], shape: 'bottle', dims: [0.065, 0.22, 0.065], color: '#a5d6a7', color2: '#1b5e20', label: '#e8f5e9', icon: 'bubbles', cost: 0.25, price: 0.89, perBox: 24, level: 16, shelfLife: 0, popularity: 0.7 },

  // ---------------- Bakery ----------------
  { id: 'bread', name: 'Daily White Bread', category: 'bakery', display: ['bakery', 'shelf'], shape: 'loaf', dims: [0.12, 0.11, 0.24], color: '#d7a35a', color2: '#ffffff', label: '#e3f2fd', icon: 'bread', cost: 0.8, price: 1.89, perBox: 10, level: 3, shelfLife: 3, popularity: 1.6 },
  { id: 'rye', name: 'Nordic Rye Bread', category: 'bakery', display: ['bakery', 'shelf'], shape: 'loaf', dims: [0.12, 0.08, 0.22], color: '#5d4037', color2: '#ffffff', label: '#fbe9e7', icon: 'wheat', cost: 0.9, price: 2.19, perBox: 10, level: 4, shelfLife: 4, popularity: 1.1 },
  { id: 'buns', name: 'Burger Buns 6-pack', category: 'bakery', display: ['bakery', 'shelf'], shape: 'buns', dims: [0.2, 0.08, 0.14], color: '#e0a050', icon: 'bread', cost: 0.8, price: 1.99, perBox: 10, level: 6, shelfLife: 3, popularity: 0.8 },
  { id: 'baguette', name: 'French Baguette', category: 'bakery', display: ['bakery'], shape: 'baguette', dims: [0.07, 0.07, 0.55], color: '#d39b4a', icon: 'bread', cost: 0.5, price: 1.39, perBox: 10, level: 8, shelfLife: 2, popularity: 0.9 },
  { id: 'croissant', name: 'Butter Croissant', category: 'bakery', display: ['bakery'], shape: 'croissant', dims: [0.14, 0.06, 0.08], color: '#e0a040', icon: 'bread', cost: 0.35, price: 0.99, perBox: 16, level: 10, shelfLife: 2, popularity: 1.0 },
  { id: 'cinnamon', name: 'Cinnamon Roll', category: 'bakery', display: ['bakery'], shape: 'roll', dims: [0.1, 0.05, 0.1], color: '#c58b4e', icon: 'cookie', cost: 0.4, price: 1.19, perBox: 16, level: 14, shelfLife: 2, popularity: 0.9 },
  { id: 'donut', name: 'Glazed Donut', category: 'bakery', display: ['bakery'], shape: 'donut', dims: [0.1, 0.04, 0.1], color: '#f48fb1', icon: 'star', cost: 0.35, price: 1.09, perBox: 16, level: 18, shelfLife: 2, popularity: 0.9 },
  { id: 'muffin', name: 'Blueberry Muffin', category: 'bakery', display: ['bakery'], shape: 'muffin', dims: [0.08, 0.09, 0.08], color: '#5c6bc0', icon: 'berry', cost: 0.45, price: 1.29, perBox: 16, level: 23, shelfLife: 3, popularity: 0.8 },

  // ---------------- Dairy & chilled ----------------
  { id: 'milk', name: 'Meadow Milk 1L', category: 'dairy', display: ['fridge'], shape: 'carton', dims: [0.075, 0.21, 0.075], color: '#ffffff', color2: '#1e88e5', label: '#ffffff', icon: 'cow', cost: 0.6, price: 1.29, perBox: 12, level: 4, shelfLife: 8, popularity: 1.8 },
  { id: 'yogurt', name: 'Creamy Yogurt', category: 'dairy', display: ['fridge'], shape: 'tub', dims: [0.08, 0.07, 0.08], color: '#fce4ec', color2: '#e91e63', label: '#ffffff', icon: 'berry', cost: 0.35, price: 0.79, perBox: 24, level: 4, shelfLife: 12, popularity: 1.1 },
  { id: 'butter', name: 'Golden Butter', category: 'dairy', display: ['fridge'], shape: 'butter', dims: [0.12, 0.05, 0.07], color: '#fff176', color2: '#1565c0', label: '#fff59d', icon: 'cow', cost: 1.2, price: 2.49, perBox: 18, level: 5, shelfLife: 30, popularity: 0.9 },
  { id: 'eggs', name: 'Free Range Eggs (12)', category: 'dairy', display: ['fridge', 'shelf'], shape: 'eggs', dims: [0.3, 0.07, 0.11], color: '#c8b49a', icon: 'egg', cost: 1.4, price: 2.99, perBox: 8, level: 5, shelfLife: 21, popularity: 1.3 },
  { id: 'cheese', name: 'Old Barn Cheese', category: 'dairy', display: ['fridge'], shape: 'cheese', dims: [0.14, 0.07, 0.1], color: '#ffca28', icon: 'cheese', cost: 2.4, price: 4.79, perBox: 12, level: 6, shelfLife: 30, popularity: 1.0 },
  { id: 'oj', name: 'Sunrise Orange Juice', category: 'dairy', display: ['fridge'], shape: 'carton', dims: [0.075, 0.21, 0.075], color: '#ffa000', color2: '#ffffff', label: '#ff8f00', icon: 'orange', cost: 0.9, price: 2.19, perBox: 12, level: 7, shelfLife: 14, popularity: 1.0 },
  { id: 'cream', name: 'Whipping Cream', category: 'dairy', display: ['fridge'], shape: 'carton', dims: [0.06, 0.12, 0.06], color: '#ffffff', color2: '#7b1fa2', label: '#f3e5f5', icon: 'cow', cost: 0.7, price: 1.59, perBox: 18, level: 10, shelfLife: 12, popularity: 0.6 },
  { id: 'oatmilk', name: 'Oat Dream Oat Drink', category: 'dairy', display: ['fridge', 'shelf'], shape: 'carton', dims: [0.075, 0.21, 0.075], color: '#e8dcc4', color2: '#3e2723', label: '#d7ccc8', icon: 'oat', cost: 0.9, price: 2.09, perBox: 12, level: 13, shelfLife: 30, popularity: 0.7 },
  { id: 'skimmilk', name: 'Meadow Skim Milk', category: 'dairy', display: ['fridge'], shape: 'carton', dims: [0.075, 0.21, 0.075], color: '#ffffff', color2: '#43a047', label: '#ffffff', icon: 'cow', cost: 0.55, price: 1.19, perBox: 12, level: 15, shelfLife: 8, popularity: 0.8 },

  // ---------------- Frozen ----------------
  { id: 'pizza', name: 'Pizza Napoli', category: 'frozen', display: ['freezer'], shape: 'box', dims: [0.27, 0.04, 0.27], color: '#c62828', color2: '#ffeb3b', label: '#d32f2f', icon: 'pizza', cost: 1.5, price: 3.99, perBox: 10, level: 6, shelfLife: 90, popularity: 1.2 },
  { id: 'icecream', name: 'Polar Scoop Vanilla', category: 'frozen', display: ['freezer'], shape: 'tub', dims: [0.13, 0.1, 0.13], color: '#fff8e1', color2: '#795548', label: '#ffffff', icon: 'icecream', cost: 1.6, price: 3.99, perBox: 12, level: 6, shelfLife: 120, popularity: 1.1 },
  { id: 'peas', name: 'Frosty Green Peas', category: 'frozen', display: ['freezer'], shape: 'bag', dims: [0.17, 0.24, 0.05], color: '#43a047', color2: '#e3f2fd', label: '#2e7d32', icon: 'pea', cost: 0.6, price: 1.49, perBox: 12, level: 7, shelfLife: 180, popularity: 0.7 },
  { id: 'fries', name: 'Crispy Oven Fries', category: 'frozen', display: ['freezer'], shape: 'bag', dims: [0.2, 0.28, 0.06], color: '#fbc02d', color2: '#c62828', label: '#f57f17', icon: 'fries', cost: 0.9, price: 2.19, perBox: 10, level: 9, shelfLife: 180, popularity: 0.9 },
  { id: 'fishsticks', name: 'Captain Fish Sticks', category: 'frozen', display: ['freezer'], shape: 'box', dims: [0.2, 0.05, 0.14], color: '#0277bd', color2: '#ffeb3b', label: '#01579b', icon: 'fish', cost: 1.4, price: 3.29, perBox: 12, level: 12, shelfLife: 180, popularity: 0.7 },
  { id: 'blueberries', name: 'Wild Blueberries (frozen)', category: 'frozen', display: ['freezer'], shape: 'bag', dims: [0.16, 0.22, 0.05], color: '#283593', color2: '#ffffff', label: '#1a237e', icon: 'berry', cost: 1.2, price: 2.89, perBox: 12, level: 17, shelfLife: 180, popularity: 0.6 },
  { id: 'icepops', name: 'Rainbow Ice Pops', category: 'frozen', display: ['freezer'], shape: 'box', dims: [0.18, 0.06, 0.12], color: '#ab47bc', color2: '#ffeb3b', label: '#8e24aa', icon: 'icecream', cost: 1.2, price: 2.99, perBox: 12, level: 22, shelfLife: 120, popularity: 0.7 },

  // ---------------- Household ----------------
  { id: 'dishsoap', name: 'Sparkle Dish Soap', category: 'household', display: ['shelf'], shape: 'bottle', dims: [0.07, 0.22, 0.05], color: '#43a047', color2: '#ffffff', label: '#e8f5e9', icon: 'bubbles', cost: 0.9, price: 2.29, perBox: 12, level: 9, shelfLife: 0, popularity: 0.8 },
  { id: 'toiletpaper', name: 'Cloud Soft Toilet Paper', category: 'household', display: ['shelf'], shape: 'tp', dims: [0.22, 0.22, 0.22], color: '#ffffff', color2: '#4fc3f7', label: '#e1f5fe', icon: 'heart', cost: 2.4, price: 5.29, perBox: 4, level: 9, shelfLife: 0, popularity: 1.1 },
  { id: 'detergent', name: 'FreshWave Detergent', category: 'household', display: ['shelf'], shape: 'bottle', dims: [0.12, 0.28, 0.08], color: '#1e88e5', color2: '#ff9800', label: '#ffffff', icon: 'sparkle', cost: 3.0, price: 7.49, perBox: 6, level: 10, shelfLife: 0, popularity: 0.7 },
  { id: 'sponges', name: 'Scrub Sponges (3)', category: 'household', display: ['shelf'], shape: 'box', dims: [0.12, 0.08, 0.04], color: '#fdd835', color2: '#43a047', label: '#fff176', icon: 'sparkle', cost: 0.6, price: 1.59, perBox: 18, level: 11, shelfLife: 0, popularity: 0.5 },
  { id: 'cleaner', name: 'Shine All-Purpose Spray', category: 'household', display: ['shelf'], shape: 'spray', dims: [0.08, 0.26, 0.06], color: '#ff7043', color2: '#ffffff', label: '#ffffff', icon: 'sparkle', cost: 1.2, price: 2.99, perBox: 12, level: 13, shelfLife: 0, popularity: 0.6 },
  { id: 'trashbags', name: 'Tough Trash Bags', category: 'household', display: ['shelf'], shape: 'box', dims: [0.14, 0.1, 0.08], color: '#37474f', color2: '#ffeb3b', label: '#263238', icon: 'star', cost: 0.9, price: 2.39, perBox: 18, level: 15, shelfLife: 0, popularity: 0.5 },
  { id: 'papertowel', name: 'Cloud Paper Towels', category: 'household', display: ['shelf'], shape: 'tp', dims: [0.24, 0.26, 0.12], color: '#ffffff', color2: '#ff9800', label: '#fff3e0', icon: 'heart', cost: 1.6, price: 3.79, perBox: 6, level: 18, shelfLife: 0, popularity: 0.6 },
  { id: 'bulbs', name: 'BrightLite LED Bulbs', category: 'household', display: ['shelf'], shape: 'box', dims: [0.08, 0.13, 0.08], color: '#fafafa', color2: '#ffb300', label: '#ffffff', icon: 'sun', cost: 1.5, price: 3.99, perBox: 12, level: 27, shelfLife: 0, popularity: 0.4 },

  // ---------------- Health & beauty ----------------
  { id: 'toothpaste', name: 'Smile Toothpaste', category: 'personal', display: ['shelf'], shape: 'box', dims: [0.19, 0.05, 0.04], color: '#e3f2fd', color2: '#d32f2f', label: '#ffffff', icon: 'tooth', cost: 0.8, price: 2.29, perBox: 24, level: 16, shelfLife: 0, popularity: 0.8 },
  { id: 'shampoo', name: 'Silky Shampoo', category: 'personal', display: ['shelf'], shape: 'bottle', dims: [0.08, 0.22, 0.05], color: '#ce93d8', color2: '#6a1b9a', label: '#f3e5f5', icon: 'flower', cost: 1.5, price: 3.99, perBox: 12, level: 16, shelfLife: 0, popularity: 0.7 },
  { id: 'soap', name: 'Petal Soap Bars', category: 'personal', display: ['shelf'], shape: 'box', dims: [0.1, 0.05, 0.07], color: '#f8bbd0', color2: '#c2185b', label: '#fce4ec', icon: 'flower', cost: 0.7, price: 1.89, perBox: 24, level: 19, shelfLife: 0, popularity: 0.6 },
  { id: 'deodorant', name: 'Arctic Fresh Deo', category: 'personal', display: ['shelf'], shape: 'spray', dims: [0.05, 0.18, 0.05], color: '#1565c0', color2: '#b3e5fc', label: '#e3f2fd', icon: 'snow', cost: 1.3, price: 3.49, perBox: 18, level: 22, shelfLife: 0, popularity: 0.6 },
  { id: 'vitamins', name: 'Daily Vitamins', category: 'personal', display: ['shelf'], shape: 'jar', dims: [0.06, 0.1, 0.06], color: '#ffffff', color2: '#ff6f00', label: '#fff3e0', icon: 'sun', cost: 3.0, price: 7.99, perBox: 12, level: 29, shelfLife: 0, popularity: 0.4 },

  // ---------------- Meat ----------------
  { id: 'mince', name: 'Ground Beef 400g', category: 'meat', display: ['meat', 'fridge'], shape: 'tray', dims: [0.18, 0.05, 0.13], color: '#c0392b', icon: 'meat', cost: 2.4, price: 4.99, perBox: 10, level: 21, shelfLife: 4, popularity: 1.2 },
  { id: 'chicken', name: 'Chicken Breast Fillets', category: 'meat', display: ['meat', 'fridge'], shape: 'tray', dims: [0.2, 0.05, 0.14], color: '#f3c1a8', icon: 'chicken', cost: 2.9, price: 5.79, perBox: 10, level: 21, shelfLife: 4, popularity: 1.2 },
  { id: 'sausage', name: 'Grill Sausages', category: 'meat', display: ['meat', 'fridge'], shape: 'tray', dims: [0.2, 0.05, 0.12], color: '#b5651d', icon: 'sausage', cost: 1.5, price: 3.29, perBox: 12, level: 22, shelfLife: 10, popularity: 1.1 },
  { id: 'ham', name: 'Smoked Ham Slices', category: 'meat', display: ['meat', 'fridge'], shape: 'tray', dims: [0.15, 0.03, 0.12], color: '#e8a0a0', icon: 'meat', cost: 1.3, price: 2.89, perBox: 14, level: 24, shelfLife: 12, popularity: 1.0 },
  { id: 'porkchop', name: 'Pork Chops', category: 'meat', display: ['meat', 'fridge'], shape: 'tray', dims: [0.2, 0.05, 0.14], color: '#e0897a', icon: 'meat', cost: 3.0, price: 5.99, perBox: 10, level: 27, shelfLife: 4, popularity: 0.7 },
  { id: 'steak', name: 'Ribeye Steak', category: 'meat', display: ['meat', 'fridge'], shape: 'tray', dims: [0.2, 0.05, 0.14], color: '#9c2a1f', icon: 'meat', cost: 5.0, price: 9.99, perBox: 8, level: 33, shelfLife: 4, popularity: 0.6 },

  // ---------------- Fish ----------------
  { id: 'salmon', name: 'Salmon Fillet', category: 'fish', display: ['fish', 'fridge'], shape: 'tray', dims: [0.2, 0.05, 0.13], color: '#ff8a65', icon: 'fish', cost: 4.0, price: 7.99, perBox: 8, level: 26, shelfLife: 3, popularity: 1.0 },
  { id: 'shrimp', name: 'Tiger Shrimp', category: 'fish', display: ['fish', 'fridge'], shape: 'tray', dims: [0.18, 0.05, 0.13], color: '#ffab91', icon: 'shrimp', cost: 3.5, price: 6.99, perBox: 8, level: 28, shelfLife: 3, popularity: 0.7 },
  { id: 'wholefish', name: 'Whole Sea Bream', category: 'fish', display: ['fish'], shape: 'fish', dims: [0.32, 0.06, 0.11], color: '#90a4ae', icon: 'fish', cost: 3.0, price: 6.49, perBox: 6, level: 32, shelfLife: 2, popularity: 0.5 },
  { id: 'smokedsalmon', name: 'Cold Smoked Salmon', category: 'fish', display: ['fish', 'fridge'], shape: 'tray', dims: [0.18, 0.03, 0.12], color: '#ff7043', icon: 'fish', cost: 2.8, price: 5.79, perBox: 10, level: 38, shelfLife: 10, popularity: 0.6 },

  // ---------------- Beer & cider ----------------
  { id: 'lager', name: 'Northern Lager', category: 'alcohol', display: ['shelf', 'fridge'], shape: 'can', dims: [0.066, 0.155, 0.066], color: '#1565c0', color2: '#ffd54f', label: '#0d47a1', icon: 'beer', cost: 0.8, price: 1.99, perBox: 24, level: 30, shelfLife: 0, popularity: 1.2 },
  { id: 'cider', name: 'Orchard Apple Cider', category: 'alcohol', display: ['shelf', 'fridge'], shape: 'can', dims: [0.066, 0.155, 0.066], color: '#689f38', color2: '#ffffff', label: '#33691e', icon: 'apple', cost: 0.9, price: 2.19, perBox: 24, level: 31, shelfLife: 0, popularity: 1.0 },
  { id: 'craftbeer', name: 'Hoppy Owl IPA', category: 'alcohol', display: ['shelf', 'fridge'], shape: 'bottle', dims: [0.065, 0.24, 0.065], color: '#4e342e', color2: '#ff8f00', label: '#ff8f00', icon: 'beer', cost: 1.4, price: 3.49, perBox: 12, level: 40, shelfLife: 0, popularity: 0.6 },

  // ---------------- Pets ----------------
  { id: 'catfood', name: 'Whiskers Cat Food', category: 'pets', display: ['shelf'], shape: 'can', dims: [0.085, 0.045, 0.085], color: '#7b1fa2', color2: '#ffeb3b', label: '#6a1b9a', icon: 'paw', cost: 0.5, price: 1.19, perBox: 24, level: 36, shelfLife: 0, popularity: 0.7 },
  { id: 'dogfood', name: 'Good Boy Dog Food', category: 'pets', display: ['shelf'], shape: 'bag', dims: [0.3, 0.42, 0.12], color: '#e65100', color2: '#ffffff', label: '#bf360c', icon: 'paw', cost: 4.0, price: 8.99, perBox: 4, level: 37, shelfLife: 0, popularity: 0.6 },
  { id: 'catlitter', name: 'Fresh Paws Litter', category: 'pets', display: ['shelf'], shape: 'bag', dims: [0.3, 0.4, 0.14], color: '#90a4ae', color2: '#1565c0', label: '#607d8b', icon: 'paw', cost: 3.0, price: 6.49, perBox: 4, level: 42, shelfLife: 0, popularity: 0.4 },

  // ---------------- Baby ----------------
  { id: 'diapers', name: 'Snuggle Diapers', category: 'baby', display: ['shelf'], shape: 'box', dims: [0.32, 0.26, 0.15], color: '#81d4fa', color2: '#ffffff', label: '#4fc3f7', icon: 'baby', cost: 6.0, price: 12.99, perBox: 4, level: 44, shelfLife: 0, popularity: 0.6 },
  { id: 'babyfood', name: 'Tiny Tummy Purée', category: 'baby', display: ['shelf'], shape: 'jar', dims: [0.06, 0.08, 0.06], color: '#ff8a65', color2: '#4fc3f7', label: '#ffffff', icon: 'baby', cost: 0.6, price: 1.49, perBox: 24, level: 46, shelfLife: 0, popularity: 0.5 },
  { id: 'wipes', name: 'Gentle Baby Wipes', category: 'baby', display: ['shelf'], shape: 'box', dims: [0.2, 0.08, 0.11], color: '#e1f5fe', color2: '#26c6da', label: '#ffffff', icon: 'baby', cost: 1.1, price: 2.69, perBox: 12, level: 50, shelfLife: 0, popularity: 0.5 },

  // ---------------- Home & garden ----------------
  { id: 'flowers', name: 'Tulip Bouquet', category: 'home', display: ['produce', 'shelf'], shape: 'flowers', dims: [0.14, 0.4, 0.14], color: '#e91e63', icon: 'flower', cost: 3.0, price: 6.99, perBox: 6, level: 55, shelfLife: 5, popularity: 0.6 },
  { id: 'charcoal', name: 'BBQ Charcoal 3kg', category: 'home', display: ['shelf'], shape: 'bag', dims: [0.3, 0.42, 0.1], color: '#263238', color2: '#ff6f00', label: '#212121', icon: 'flame', cost: 3.0, price: 6.99, perBox: 4, level: 58, shelfLife: 0, popularity: 0.5 },
  { id: 'plant', name: 'Potted Succulent', category: 'home', display: ['shelf', 'produce'], shape: 'plant', dims: [0.12, 0.18, 0.12], color: '#2e7d32', icon: 'leaf', cost: 2.5, price: 5.99, perBox: 6, level: 62, shelfLife: 0, popularity: 0.4 },
  { id: 'candles', name: 'Cozy Candles', category: 'home', display: ['shelf'], shape: 'box', dims: [0.12, 0.12, 0.12], color: '#fff3e0', color2: '#e65100', label: '#ffe0b2', icon: 'flame', cost: 1.5, price: 3.99, perBox: 12, level: 65, shelfLife: 0, popularity: 0.4 },

  // ---------------- Kitchen ----------------
  { id: 'mug', name: 'Happy Mug', category: 'kitchen', display: ['shelf'], shape: 'mug', dims: [0.12, 0.1, 0.09], color: '#ff7043', icon: 'cup', cost: 2.0, price: 4.99, perBox: 12, level: 68, shelfLife: 0, popularity: 0.4 },
  { id: 'pan', name: 'ProChef Frying Pan', category: 'kitchen', display: ['shelf'], shape: 'pan', dims: [0.28, 0.06, 0.48], color: '#37474f', icon: 'flame', cost: 8.0, price: 19.99, perBox: 4, level: 72, shelfLife: 0, popularity: 0.3 },

  // ---------------- Electronics ----------------
  { id: 'batteries', name: 'PowerCell AA (4)', category: 'electronics', display: ['shelf'], shape: 'blister', dims: [0.1, 0.17, 0.03], color: '#212121', color2: '#ffc107', label: '#ffc107', icon: 'battery', cost: 2.0, price: 4.99, perBox: 24, level: 82, shelfLife: 0, popularity: 0.6 },
  { id: 'charger', name: 'QuickCharge Cable', category: 'electronics', display: ['shelf'], shape: 'blister', dims: [0.1, 0.17, 0.03], color: '#ffffff', color2: '#1e88e5', label: '#e3f2fd', icon: 'bolt', cost: 4.0, price: 11.99, perBox: 12, level: 86, shelfLife: 0, popularity: 0.4 },
  { id: 'headphones', name: 'BassPop Earbuds', category: 'electronics', display: ['shelf'], shape: 'box', dims: [0.12, 0.16, 0.06], color: '#212121', color2: '#e91e63', label: '#000000', icon: 'note', cost: 8.0, price: 19.99, perBox: 8, level: 92, shelfLife: 0, popularity: 0.3 },

  // ---------------- Toys ----------------
  { id: 'toycar', name: 'Turbo Racer Toy Car', category: 'toys', display: ['shelf'], shape: 'box', dims: [0.18, 0.1, 0.09], color: '#e53935', color2: '#ffeb3b', label: '#1565c0', icon: 'star', cost: 4.0, price: 9.99, perBox: 8, level: 98, shelfLife: 0, popularity: 0.4 },
  { id: 'ball', name: 'Bouncy Beach Ball', category: 'toys', display: ['shelf'], shape: 'ball', dims: [0.2, 0.2, 0.2], color: '#ffeb3b', color2: '#e53935', icon: 'star', cost: 2.5, price: 6.49, perBox: 6, level: 102, shelfLife: 0, popularity: 0.4 },
  { id: 'teddy', name: 'Cuddly Teddy Bear', category: 'toys', display: ['shelf'], shape: 'teddy', dims: [0.18, 0.25, 0.14], color: '#a1662f', icon: 'heart', cost: 6.0, price: 14.99, perBox: 6, level: 108, shelfLife: 0, popularity: 0.3 },

  // ---------------- Clothing ----------------
  { id: 'socks', name: 'Comfy Socks (3)', category: 'clothing', display: ['shelf'], shape: 'box', dims: [0.12, 0.2, 0.03], color: '#5c6bc0', color2: '#ffffff', label: '#3949ab', icon: 'shirt', cost: 2.0, price: 5.99, perBox: 12, level: 118, shelfLife: 0, popularity: 0.5 },
  { id: 'tshirt', name: 'Basic Cotton Tee', category: 'clothing', display: ['shelf'], shape: 'folded', dims: [0.24, 0.04, 0.3], color: '#26a69a', icon: 'shirt', cost: 4.0, price: 9.99, perBox: 8, level: 124, shelfLife: 0, popularity: 0.4 },
];

export const PRODUCTS: ProductDef[] = RAW.map((p) => ({
  label: p.label ?? p.color,
  color2: p.color2 ?? '#ffffff',
  popularity: p.popularity ?? 1,
  ...p,
}));

export const PRODUCT_MAP = new Map(PRODUCTS.map((p) => [p.id, p]));
export function product(id: string): ProductDef {
  const p = PRODUCT_MAP.get(id);
  if (!p) throw new Error('Unknown product ' + id);
  return p;
}

/** Is this one of the "natural" loose produce shapes (no printed label)? */
export function isLooseProduce(p: ProductDef) {
  return p.category === 'produce' && !['potatoBag', 'berries'].includes(p.shape);
}

/** Box (carton) size for shipping this product. */
export function boxSizeFor(p: ProductDef): [number, number, number] {
  if (p.category === 'produce') return [0.5, 0.26, 0.36];
  const vol = p.dims[0] * p.dims[1] * p.dims[2] * p.perBox;
  if (vol < 0.006) return [0.34, 0.2, 0.26];
  if (vol < 0.016) return [0.42, 0.26, 0.32];
  if (vol < 0.035) return [0.5, 0.32, 0.38];
  return [0.6, 0.4, 0.44];
}

export type BoxStyle = 'cardboard' | 'crate' | 'cold';
export function boxStyleFor(p: ProductDef): BoxStyle {
  if (p.category === 'produce' && isLooseProduce(p)) return 'crate';
  if (p.category === 'frozen' || p.category === 'meat' || p.category === 'fish') return 'cold';
  return 'cardboard';
}
