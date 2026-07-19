import { std } from "wow/wotlk";

std.SQL.Databases.world_dest.writeEarly(`
    CREATE TABLE IF NOT EXISTS \`store_items\` (
    id INT NOT NULL AUTO_INCREMENT,
    flags INT(10) UNSIGNED NOT NULL DEFAULT '0',
    cost INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NOT NULL,
    name_en VARCHAR(100) NULL,
    description_en VARCHAR(255) NULL,
    category INT NOT NULL,
    purchase_id INT(10) UNSIGNED NOT NULL DEFAULT '0',
    extra_id INT(10) UNSIGNED NOT NULL DEFAULT '0',
    PRIMARY KEY (id)
) ENGINE=INNODB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
`);

// Existing installations predate the English columns. Keep the current
// name/description as the Russian/default fallback and migrate additively.
const storeTable = std.SQL.Databases.world_dest.read(
  `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='store_items'`
);
if (storeTable.length > 0) {
  const englishName = std.SQL.Databases.world_dest.read(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='store_items' AND COLUMN_NAME='name_en'`
  );
  if (englishName.length === 0) {
    std.SQL.Databases.world_dest.writeEarly(
      `ALTER TABLE \`store_items\` ADD COLUMN name_en VARCHAR(100) NULL AFTER description;`
    );
  }
  const englishDescription = std.SQL.Databases.world_dest.read(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='store_items' AND COLUMN_NAME='description_en'`
  );
  if (englishDescription.length === 0) {
    std.SQL.Databases.world_dest.writeEarly(
      `ALTER TABLE \`store_items\` ADD COLUMN description_en VARCHAR(255) NULL AFTER name_en;`
    );
  }
}

// Check if donation_points has already been made
const d = std.SQL.Databases.auth.read(
  `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_NAME='account' AND TABLE_SCHEMA=DATABASE() AND COLUMN_NAME='donation_points'`
);
if (d.length === 0) {
  // donation_points hasn't been made, so we make it now
  std.SQL.Databases.auth.writeEarly(
    `ALTER TABLE \`account\` ADD COLUMN donation_points INT DEFAULT 0;`
  );
}

std.SQL.Databases.world_dest.writeEarly(`
CREATE TABLE IF NOT EXISTS \`store_audit\` (
transaction_id INT NOT NULL AUTO_INCREMENT,
cost INT NOT NULL,
name VARCHAR(100) NOT NULL,
description VARCHAR(255) NOT NULL,
account_id INT UNSIGNED NOT NULL,
purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
PRIMARY KEY (transaction_id)
) ENGINE=INNODB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
`);
