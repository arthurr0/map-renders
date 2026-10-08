import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the layout', () => {
    render(<App />);
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Shots')).toBeTruthy();
  });
});
