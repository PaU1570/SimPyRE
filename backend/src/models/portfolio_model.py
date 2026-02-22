from pydantic import BaseModel, field_validator, model_validator


class Allocation(BaseModel):
    """Asset allocation as percentages (0-1) that must sum to 1."""

    stocks: float
    bonds: float
    cash: float

    @field_validator("*")
    @classmethod
    def weight_between_0_and_1(cls, v: float) -> float:
        if not 0 <= v <= 1:
            raise ValueError("each weight must be between 0 and 1")
        return v

    @model_validator(mode="after")
    def weights_sum_to_one(self) -> "Allocation":
        total = self.stocks + self.bonds + self.cash
        if abs(total - 1.0) > 1e-9:
            raise ValueError(f"weights must sum to 1, got {total}")
        return self


class PortfolioModel(BaseModel):
    """Model representing a financial portfolio."""

    portfolio_value: float
    allocation: Allocation

    @classmethod
    def from_values(
        cls, stocks_value: float, bonds_value: float, cash_value: float
    ) -> "PortfolioModel":
        total = stocks_value + bonds_value + cash_value
        if total < 0:
            raise ValueError("total portfolio value cannot be less than 0")
        return cls(
            portfolio_value=total,
            allocation=(
                Allocation(
                    stocks=stocks_value / total,
                    bonds=bonds_value / total,
                    cash=cash_value / total,
                )
                if total > 0
                else Allocation(
                    stocks=0, bonds=0, cash=1
                )  # arbitrary allocation to pass validation
            ),
        )

    @property
    def stocks_value(self) -> float:
        return self.portfolio_value * self.allocation.stocks

    @property
    def bonds_value(self) -> float:
        return self.portfolio_value * self.allocation.bonds

    @property
    def cash_value(self) -> float:
        return self.portfolio_value * self.allocation.cash
