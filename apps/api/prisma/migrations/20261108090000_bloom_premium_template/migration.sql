-- Register the BLOOM premium bakery template without changing existing restaurants.
ALTER TYPE "menu_template" ADD VALUE IF NOT EXISTS 'BLOOM';
