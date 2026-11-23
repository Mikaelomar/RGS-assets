// Employee roles and candidate generation.
import type { RoleId } from '../game/state';

export interface RoleDef {
  id: RoleId;
  name: string;
  icon: string;
  level: number;
  wage: number; // $ per hour at skill 1
  desc: string;
  uniform: string;
  promoteTo?: RoleId;
}

export const ROLES: RoleDef[] = [
  { id: 'cashier', name: 'Cashier', icon: '🧾', level: 5, wage: 12, desc: 'Works a checkout counter: scans items and takes payments.', uniform: '#1e88e5', promoteTo: 'deptmanager' },
  { id: 'stocker', name: 'Shelf Stocker', icon: '📦', level: 7, wage: 12, desc: 'Refills empty shelves from boxes in the warehouse.', uniform: '#43a047', promoteTo: 'deptmanager' },
  { id: 'cleaner', name: 'Cleaner', icon: '🧹', level: 9, wage: 11, desc: 'Mops floors, cleans spills, empties trash bins and cleans restrooms.', uniform: '#8e24aa' },
  { id: 'warehouse', name: 'Warehouse Worker', icon: '🚚', level: 12, wage: 13, desc: 'Moves delivered boxes to warehouse racks and recycles empty boxes.', uniform: '#f9a825', promoteTo: 'deptmanager' },
  { id: 'security', name: 'Security Guard', icon: '👮', level: 15, wage: 14, desc: 'Watches the entrance and stops shoplifters.', uniform: '#263238' },
  { id: 'technician', name: 'Maintenance Technician', icon: '🔧', level: 18, wage: 18, desc: 'Repairs broken fridges, registers and HVAC. Keeps equipment in shape.', uniform: '#ef6c00' },
  { id: 'baker', name: 'Baker', icon: '🥐', level: 20, wage: 15, desc: 'Bakes fresh bread in the bakery oven and fills the bakery racks.', uniform: '#fafafa' },
  { id: 'butcher', name: 'Butcher & Fishmonger', icon: '🥩', level: 23, wage: 17, desc: 'Keeps the meat and seafood counters stocked and fresh.', uniform: '#b71c1c' },
  { id: 'deptmanager', name: 'Department Manager', icon: '📋', level: 40, wage: 22, desc: 'All staff work 15% faster. Removes expired products.', uniform: '#5e35b1', promoteTo: 'manager' },
  { id: 'manager', name: 'Store Manager', icon: '👔', level: 50, wage: 30, desc: 'Orders stock automatically when the warehouse runs low and opens/closes the store on time.', uniform: '#37474f' },
];
export const ROLE_MAP = new Map(ROLES.map((r) => [r.id, r]));

export const FIRST_NAMES_M = ['Mikko', 'Juha', 'Antti', 'Liam', 'Noah', 'Oliver', 'Leo', 'Elias', 'Ville', 'Jari', 'Tomas', 'Omar', 'Ali', 'David', 'Marco', 'Jonas', 'Aleksi', 'Samuel', 'Kai', 'Lucas', 'Ethan', 'Matti', 'Pekka', 'Hassan', 'Yusuf', 'Arjun', 'Kenji', 'Diego', 'Sami', 'Niko'];
export const FIRST_NAMES_F = ['Aino', 'Emma', 'Sofia', 'Olivia', 'Ella', 'Lily', 'Mia', 'Laura', 'Anna', 'Sara', 'Noora', 'Fatima', 'Aisha', 'Maria', 'Julia', 'Elina', 'Helmi', 'Nora', 'Isla', 'Grace', 'Zoe', 'Leila', 'Mei', 'Priya', 'Lucia', 'Hanna', 'Venla', 'Iida', 'Amira', 'Chloe'];
export const LAST_NAMES = ['Virtanen', 'Korhonen', 'Mäkinen', 'Nieminen', 'Smith', 'Johnson', 'Lee', 'García', 'Khan', 'Nguyen', 'Müller', 'Rossi', 'Silva', 'Lahtinen', 'Heikkinen', 'Brown', 'Taylor', 'Ahmed', 'Kim', 'Novak', 'Laine', 'Salo', 'Koskinen', 'Wilson', 'Martin'];

export const CUSTOMER_REVIEWS = {
  great: ['Great prices and super clean!', 'My favorite store in town!', 'Fresh products, friendly cashier.', 'Everything I needed, fast checkout.', 'Lovely shop, will come again!', 'So well organized!'],
  ok: ['Decent store.', 'Okay prices.', 'Found most things I needed.', 'Not bad, a bit pricey.', 'Fine, nothing special.'],
  bad: ['Shelves were empty!', 'Way too expensive.', 'The floor was dirty.', 'I waited forever at the checkout.', 'Found expired food. Gross.', 'Could not find what I needed.', 'The cashier gave me the wrong change!'],
};
