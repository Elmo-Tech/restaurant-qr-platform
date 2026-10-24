-- Register the EMBER premium design; existing restaurants retain their template.
ALTER TYPE "menu_template" ADD VALUE IF NOT EXISTS 'EMBER';
