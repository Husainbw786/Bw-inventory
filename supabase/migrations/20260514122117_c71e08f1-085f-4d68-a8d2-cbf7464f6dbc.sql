ALTER TABLE public.purchases DROP CONSTRAINT purchases_item_id_fkey, DROP CONSTRAINT purchases_dealer_id_fkey;
ALTER TABLE public.purchases ADD CONSTRAINT purchases_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE SET NULL;
ALTER TABLE public.purchases ADD CONSTRAINT purchases_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES public.dealers(id) ON DELETE SET NULL;
ALTER TABLE public.purchases ALTER COLUMN item_id DROP NOT NULL, ALTER COLUMN dealer_id DROP NOT NULL;

ALTER TABLE public.sales DROP CONSTRAINT sales_customer_id_fkey;
ALTER TABLE public.sales ADD CONSTRAINT sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.sales ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE public.sale_lines DROP CONSTRAINT sale_lines_item_id_fkey;
ALTER TABLE public.sale_lines ADD CONSTRAINT sale_lines_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE SET NULL;
ALTER TABLE public.sale_lines ALTER COLUMN item_id DROP NOT NULL;