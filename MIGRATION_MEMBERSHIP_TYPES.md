# Membership Types Migration

This document describes the migration from storing membership types as text strings to a separate localized table.

## Overview

The membership system has been updated to support:
- **Localized membership type names** (Finnish and English)
- **Membership type descriptions** for both languages
- **Editable memberships** (can only edit if no members are tied to it)
- **Proper normalized database structure**

## Database Changes

### New Table: `membership_type`

```sql
CREATE TABLE membership_type (
  id TEXT PRIMARY KEY,
  name_fi TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_fi TEXT,
  description_en TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
)
```

### Updated Table: `membership`

**Before:**
```sql
CREATE TABLE membership (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,  -- Old: Finnish name as text
  stripe_price_id TEXT NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  price_cents INTEGER DEFAULT 0 NOT NULL,
  requires_student_verification BOOLEAN DEFAULT false NOT NULL
)
```

**After:**
```sql
CREATE TABLE membership (
  id TEXT PRIMARY KEY,
  membership_type_id TEXT NOT NULL REFERENCES membership_type(id),  -- New: FK to membership_type
  stripe_price_id TEXT NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  price_cents INTEGER DEFAULT 0 NOT NULL,
  requires_student_verification BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
)
```

## Migration Steps

### For Development (Fresh Database)

If you're starting fresh or can reset your database:

```bash
# Reset and reseed the database
pnpm db:reset
pnpm db:push
pnpm db:seed
```

### For Production (Existing Data)

**IMPORTANT:** The migration will modify your existing data. Make a backup first!

1. **Backup your database** before running migration:
   ```bash
   # Example for PostgreSQL
   pg_dump your_database > backup_before_migration.sql
   ```

2. **Run the Drizzle migration**:
   ```bash
   # This will run the SQL migration in drizzle/0003_localize_membership_types.sql
   # which:
   # - Creates the membership_type table
   # - Populates it with default membership types
   # - Adds membership_type_id column to membership table
   # - Migrates existing data by matching Finnish names
   # - Adds foreign key constraint
   # - Drops the old type column
   pnpm db:migrate
   ```

3. **Verify the migration**:
   ```bash
   # Check membership types were created
   psql your_database -c "SELECT * FROM membership_type;"

   # Check memberships reference types correctly
   psql your_database -c "SELECT m.id, mt.name_fi, mt.name_en FROM membership m JOIN membership_type mt ON m.membership_type_id = mt.id LIMIT 5;"
   ```

### Migration File

The migration is located at `drizzle/0003_localize_membership_types.sql` and handles:
- Creating the new `membership_type` table
- **Dynamically extracting** unique membership types from existing memberships
- **Automatically generating** URL-friendly IDs from type names (e.g., "varsinainen jäsen" → `varsinainen-jasen`)
- Creating membership type records with:
  - Existing Finnish name for **both** `name_fi` and `name_en` (English translations need to be added manually)
  - Empty `description_fi` and `description_en` fields (descriptions need to be added manually)
- Reconnecting all memberships to their corresponding type IDs
- Adding proper constraints and foreign keys
- Cleaning up the old `type` column

**Post-Migration Tasks:**
After running the migration, admins should:
1. Navigate to `/admin/memberships` and edit each membership type
2. Add proper English translations for `name_en`
3. Add descriptions in both Finnish (`description_fi`) and English (`description_en`)

## How the Migration Works

The migration uses PL/pgSQL to:
1. **Extract** all unique values from the existing `membership.type` column
2. **Generate** URL-friendly IDs by:
   - Converting to lowercase
   - Removing special characters
   - Replacing spaces with hyphens
   - Trimming leading/trailing hyphens
3. **Create** membership_type records with the existing name duplicated for both languages
4. **Update** all memberships to reference their corresponding type ID
5. **Add** foreign key constraints to maintain referential integrity

This dynamic approach works with any existing membership type names, not just predefined values.

## UI Changes

### Admin - Manage Memberships (`/admin/memberships`)
- Membership type is now selected from a dropdown (not a free-text field)
- Shows localized names based on current locale
- Displays membership type descriptions
- **NEW:** Edit button for memberships without members
- Inline editing for membership details
- Cannot edit if members are tied to the membership

### User - Buy Membership (`/new`)
- Displays localized membership type names and descriptions
- Shows proper Finnish/English names based on user's locale

### User - Dashboard (`/`)
- Shows localized membership type names in membership list

### Admin - Members List (`/admin/members`)
- Displays localized membership type names in table
- Filter by membership type works with localized names
- Export/copy functions use localized names

### Admin - Import Members (`/admin/members/import`)
- CSV import now accepts **both Finnish and English** membership type names
- Validates against existing membership types

## Code Changes

### Schema (`src/lib/server/db/schema.ts`)
- Added `membershipType` table
- Updated `membership` table with `membershipTypeId` foreign key
- Added relations between tables
- Added TypeScript types

### Seed Data (`src/lib/server/db/seed.ts`)
- Seeds membership types before memberships
- Uses `membershipTypeId` references

### All Pages Using Memberships
Updated to use localized names:
- Home page
- New membership page
- Admin memberships page
- Admin members pages
- Admin import page

## Translation Keys Added

### English (`src/lib/i18n/en/index.ts`)
```typescript
common: {
  edit: "Edit",
  cancel: "Cancel",
}
admin: {
  memberships: {
    cannotEdit: "Cannot edit (has members)",
  }
}
```

### Finnish (`src/lib/i18n/fi/index.ts`)
```typescript
common: {
  edit: "Muokkaa",
  cancel: "Peruuta",
}
admin: {
  memberships: {
    cannotEdit: "Ei voi muokata (on jäseniä)",
  }
}
```

## Rollback Instructions

If you need to rollback the migration:

1. **Restore from backup**:
   ```bash
   psql your_database < backup_before_migration.sql
   ```

2. **Revert code changes**:
   ```bash
   git revert <commit-hash>
   ```

## Testing Checklist

- [ ] Run seed script successfully
- [ ] Create new membership with each type
- [ ] Edit membership without members
- [ ] Try to edit membership with members (should show error)
- [ ] Delete membership without members
- [ ] Buy membership as user
- [ ] View memberships in both Finnish and English
- [ ] Filter members by type in admin panel
- [ ] Import members via CSV with Finnish names
- [ ] Import members via CSV with English names
- [ ] Switch between locales and verify all names display correctly

## Support

If you encounter issues during migration, check:
1. Database connection string is correct
2. You have Node.js 24.5.0 or higher
3. All dependencies are installed (`pnpm install`)
4. The migration script has execute permissions

For questions or issues, please open a GitHub issue.
