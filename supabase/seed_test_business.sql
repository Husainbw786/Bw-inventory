-- Dummy data for the "test" business (one-off seed; not a migration).
-- Inserts purchases BEFORE sale_lines so the stock-enforcement trigger passes.
DO $$
DECLARE
  b uuid := '1d49a5b5-191c-4353-a0cb-029a96598bc2';   -- test business
  u uuid := '93c4f36c-6af7-49f2-aee7-7c58ad0fb665';   -- owner (husainhackerrank)
  -- items
  i_oil uuid; i_brake uuid; i_clutch uuid; i_plug uuid; i_air uuid;
  i_chain uuid; i_bulb uuid; i_tube uuid; i_batt uuid; i_mirror uuid;
  -- dealers
  d_sharma uuid; d_maha uuid; d_speed uuid;
  -- customers
  c_raju uuid; c_khan uuid; c_verma uuid; c_city uuid;
  -- sales
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid;
BEGIN
  -- ITEMS (name, company brand, unit, low_stock)
  INSERT INTO items (business_id, name, company, unit, low_stock, created_by) VALUES
    (b,'Engine Oil 4T','Castrol','1 L',10,u) RETURNING id INTO i_oil;
  INSERT INTO items (business_id, name, company, unit, low_stock, created_by) VALUES
    (b,'Brake Pad Set','Hero','set',8,u) RETURNING id INTO i_brake;
  INSERT INTO items (business_id, name, company, unit, low_stock, created_by) VALUES
    (b,'Clutch Plate','Bajaj','set',5,u) RETURNING id INTO i_clutch;
  INSERT INTO items (business_id, name, company, unit, low_stock, created_by) VALUES
    (b,'Spark Plug','Bosch','pc',20,u) RETURNING id INTO i_plug;
  INSERT INTO items (business_id, name, company, unit, low_stock, created_by) VALUES
    (b,'Air Filter','TVS','pc',10,u) RETURNING id INTO i_air;
  INSERT INTO items (business_id, name, company, unit, low_stock, created_by) VALUES
    (b,'Chain Sprocket Kit','Honda','kit',6,u) RETURNING id INTO i_chain;
  INSERT INTO items (business_id, name, company, unit, low_stock, created_by) VALUES
    (b,'Headlight Bulb','Philips','pc',15,u) RETURNING id INTO i_bulb;
  INSERT INTO items (business_id, name, company, unit, low_stock, created_by) VALUES
    (b,'Tyre Tube','MRF','pc',12,u) RETURNING id INTO i_tube;
  INSERT INTO items (business_id, name, company, unit, low_stock, created_by) VALUES
    (b,'Battery 12V','Exide','pc',4,u) RETURNING id INTO i_batt;
  INSERT INTO items (business_id, name, company, unit, low_stock, created_by) VALUES
    (b,'Mirror Set','Yamaha','pair',10,u) RETURNING id INTO i_mirror;

  -- DEALERS
  INSERT INTO dealers (business_id, name, phone, address, created_by) VALUES
    (b,'Sharma Auto Parts','98260 11223','Sindhi Colony, Indore',u) RETURNING id INTO d_sharma;
  INSERT INTO dealers (business_id, name, phone, address, created_by) VALUES
    (b,'Mahalaxmi Spares','99815 44556','Mandi Road, Dewas',u) RETURNING id INTO d_maha;
  INSERT INTO dealers (business_id, name, phone, address, created_by) VALUES
    (b,'Speed Motors Wholesale','78690 55430','Transport Nagar, Indore',u) RETURNING id INTO d_speed;

  -- CUSTOMERS
  INSERT INTO customers (business_id, name, phone, address, created_by) VALUES
    (b,'Raju Auto Garage','98931 22110','Vijay Nagar, Indore',u) RETURNING id INTO c_raju;
  INSERT INTO customers (business_id, name, phone, address, created_by) VALUES
    (b,'Khan Motors','70249 77889','MG Road, Indore',u) RETURNING id INTO c_khan;
  INSERT INTO customers (business_id, name, phone, address, created_by) VALUES
    (b,'Verma Two Wheelers','88179 33445','Palasia, Indore',u) RETURNING id INTO c_verma;
  INSERT INTO customers (business_id, name, phone, address, created_by) VALUES
    (b,'City Bike Service','90390 22110','Rajwada, Indore',u) RETURNING id INTO c_city;

  -- PURCHASES (build stock first). Two items kept low on purpose.
  INSERT INTO purchases (business_id, date, item_id, dealer_id, qty, rate, created_by) VALUES
    (b,'2026-06-02',i_oil,   d_sharma,100,320,u),
    (b,'2026-06-02',i_brake, d_sharma, 50,240,u),
    (b,'2026-06-03',i_plug,  d_maha,  200, 90,u),
    (b,'2026-06-04',i_air,   d_maha,   60,160,u),
    (b,'2026-06-05',i_tube,  d_speed,  70,180,u),
    (b,'2026-06-05',i_bulb,  d_speed,  80, 70,u),
    (b,'2026-06-06',i_mirror,d_sharma, 50,150,u),
    (b,'2026-06-07',i_clutch,d_maha,   30,480,u),
    (b,'2026-06-08',i_chain, d_speed,   6,720,u),   -- low stock after sale
    (b,'2026-06-09',i_batt,  d_sharma,  5,1450,u);  -- low stock after sale

  -- SALES + LINES
  -- S1: Raju, bill, part-paid
  INSERT INTO sales (business_id, date, customer_id, is_bill, payment_received, amount_paid, created_by)
    VALUES (b,'2026-06-13',c_raju,true,false,2000,u) RETURNING id INTO s1;
  INSERT INTO sale_lines (sale_id,item_id,qty,rate) VALUES (s1,i_oil,4,420),(s1,i_brake,2,340);

  -- S2: Khan, bill, fully paid
  INSERT INTO sales (business_id, date, customer_id, is_bill, payment_received, amount_paid, created_by)
    VALUES (b,'2026-06-13',c_khan,true,true,3250,u) RETURNING id INTO s2;
  INSERT INTO sale_lines (sale_id,item_id,qty,rate) VALUES (s2,i_plug,10,140),(s2,i_batt,1,1850);

  -- S3: Verma, bill, part-paid
  INSERT INTO sales (business_id, date, customer_id, is_bill, payment_received, amount_paid, created_by)
    VALUES (b,'2026-06-12',c_verma,true,false,1000,u) RETURNING id INTO s3;
  INSERT INTO sale_lines (sale_id,item_id,qty,rate) VALUES (s3,i_chain,2,980);

  -- S4: City Bike, quick sale (not a bill), unpaid
  INSERT INTO sales (business_id, date, customer_id, is_bill, payment_received, amount_paid, created_by)
    VALUES (b,'2026-06-11',c_city,false,false,0,u) RETURNING id INTO s4;
  INSERT INTO sale_lines (sale_id,item_id,qty,rate) VALUES (s4,i_tube,3,260);

  -- S5: Raju, bill, fully paid, extra expenses charged to customer
  INSERT INTO sales (business_id, date, customer_id, is_bill, payment_received, amount_paid, extra_expenses, extra_expenses_charge_customer, created_by)
    VALUES (b,'2026-06-10',c_raju,true,true,1480,60,true,u) RETURNING id INTO s5;
  INSERT INTO sale_lines (sale_id,item_id,qty,rate) VALUES (s5,i_air,2,240),(s5,i_bulb,4,120),(s5,i_mirror,2,230);

  -- EXPENSES
  INSERT INTO expenses (business_id, date, category, amount, note, created_by) VALUES
    (b,'2026-06-05','Rent',18000,'Shop rent — June',u),
    (b,'2026-06-11','Transport',2400,'Tempo for stock pickup',u),
    (b,'2026-06-08','Electricity',3150,'Electricity bill',u),
    (b,'2026-06-01','Salary',12000,'Helper salary',u),
    (b,'2026-06-12','Tea & Snacks',450,'Shop tea',u);
END $$;
