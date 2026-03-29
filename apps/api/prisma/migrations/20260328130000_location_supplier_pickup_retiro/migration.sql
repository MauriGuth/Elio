-- AlterEnum (solo esto: PG no permite usar el valor nuevo en la misma transacción)
ALTER TYPE "LocationType" ADD VALUE 'SUPPLIER_PICKUP';
