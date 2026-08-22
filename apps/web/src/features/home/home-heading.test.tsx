import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HomeHeading } from '@/features/home/home-heading';

describe('HomeHeading', () => {
  it('renders the level-1 heading', () => {
    render(<HomeHeading />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Monorepo Boilerplate' }),
    ).toBeDefined();
  });
});
