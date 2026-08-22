import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectPrismaSnakeCaseViolations } from '@/shared/infrastructure/prisma/prisma-snake-case-maps';

describe('collectPrismaSnakeCaseViolations', () => {
  it('requires @@map and @map when JS names are not snake_case', () => {
    const schema = `
      model User {
        id        String   @id
        createdAt DateTime
        posts     Post[]
      }

      model Post {
        id       String @id
        author   User   @relation(fields: [authorId], references: [id])
        authorId String
      }

      enum OrderStatus {
        Pending
      }
    `;

    expect(collectPrismaSnakeCaseViolations(schema)).toEqual([
      'model User missing @@map("user")',
      'User.createdAt missing @map("created_at")',
      'model Post missing @@map("post")',
      'Post.authorId missing @map("author_id")',
      'enum OrderStatus missing @@map("order_status")',
      'OrderStatus.Pending missing @map("pending")',
    ]);
  });

  it('accepts mapped names and skips relation fields', () => {
    const schema = `
      model User {
        id        String   @id
        createdAt DateTime @map("created_at")
        posts     Post[]

        @@map("user")
      }

      model Post {
        id       String @id
        author   User   @relation(fields: [authorId], references: [id])
        authorId String @map("author_id")

        @@map("post")
      }

      enum OrderStatus {
        Pending @map("pending")

        @@map("order_status")
      }
    `;

    expect(collectPrismaSnakeCaseViolations(schema)).toEqual([]);
  });

  it('accepts the committed schema', () => {
    const schema = readFileSync(
      join(process.cwd(), 'prisma/schema.prisma'),
      'utf8',
    );

    expect(collectPrismaSnakeCaseViolations(schema)).toEqual([]);
  });
});
