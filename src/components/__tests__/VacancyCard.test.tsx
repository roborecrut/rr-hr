import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import VacancyCard from "@/components/VacancyCard";

const baseVacancy = {
  id: "v1",
  roleName: "Менеджер по продажам",
  companyName: "ООО Тест",
  companyLogo: null,
  industry: "B2B",
  salaryTerms: "от 80 000 ₽",
  scheduleTerms: "5/2",
  vacancyText: "Активные продажи новым клиентам.",
};

describe("VacancyCard", () => {
  it("renders vertical layout by default", () => {
    render(<VacancyCard vacancy={baseVacancy} onOpen={() => {}} />);
    expect(screen.getByText("Менеджер по продажам")).toBeInTheDocument();
  });

  it("renders horizontal layout when layout='horizontal'", () => {
    const { container } = render(
      <VacancyCard vacancy={baseVacancy} onOpen={() => {}} layout="horizontal" />,
    );
    const article = container.querySelector("article")!;
    expect(article.className).toMatch(/md:flex-row/);
    expect(article.className).toMatch(/w-full/);
  });

  it("calls onOpen when clicked", () => {
    const onOpen = vi.fn();
    render(<VacancyCard vacancy={baseVacancy} onOpen={onOpen} layout="horizontal" />);
    screen.getByText("Менеджер по продажам").closest("article")!.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});