-- Storefront navigation and product listing filters.
CREATE INDEX IF NOT EXISTS products_status_created_idx
  ON products(status, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS products_category_status_created_idx
  ON products(category, status, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS products_category_id_status_created_idx
  ON products(category_id, status, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS products_brand_ci_status_created_idx
  ON products(lower(brand), status, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS product_variants_product_status_price_idx
  ON product_variants(product_id, status, sale_price);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS product_images_product_order_idx
  ON product_images(product_id, display_order);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS product_specs_product_order_idx
  ON product_specs(product_id, display_order);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS reviews_product_status_created_idx
  ON reviews(product_id, status, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS product_questions_product_status_created_idx
  ON product_questions(product_id, status, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS product_answers_question_created_idx
  ON product_answers(question_id, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS storefront_sections_visibility_order_idx
  ON storefront_sections(status, display_order, starts_at, ends_at);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS storefront_section_products_order_idx
  ON storefront_section_products(section_id, display_order);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS wishlists_owner_created_idx
  ON wishlists(owner_id, created_at DESC);
