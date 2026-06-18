import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HiringCalculator from "@/components/HiringCalculator";

describe("HiringCalculator", () => {
  it("does not render the removed pricing-tier block", () => {
    render(<HiringCalculator />);
    expect(
      screen.queryByText(/Тарифы — цена за каждое интервью или обучение/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/1 RR = 1 ₽/)).not.toBeInTheDocument();
    expect(screen.queryByText(/200\+ шт/)).not.toBeInTheDocument();
  });

  it("still renders the comparison and 'дешевле и … производительнее' summary", () => {
    render(<HiringCalculator />);
    expect(screen.getByText(/Калькулятор «Робот vs Рекрутер»/i)).toBeInTheDocument();
    expect(screen.getByText(/дешевле и в .* раз производительнее/i)).toBeInTheDocument();
  });
});