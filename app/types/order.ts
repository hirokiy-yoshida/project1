import { Menu } from './menu';

export type OrderItem = {
  id: number;
  drinkMenu: Menu | null;
  foodMenu: Menu | null;
  isEatIn: boolean;
  hasUtensils: boolean;
};