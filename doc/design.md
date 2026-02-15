# Components

## Simulation Engine
### Responsibilities
Orchestrate simulation execution. Initialize all components and manage their execution to run simulations.
### Data Models
- SimulationConfig: main configuration object for simulations. Contains all underlying sub-configurations for other components.
- IncomeTargets
- PortfolioState
### Interfaces
- TODO

## Scenario Engine
### Responsibilities
Generate market scenarios for simulations. Should provide yearly data for stock returns, bond yields, and inflation for the requested duration. Should be able to use historical data as well as generate new simulated data.
### Data Models
- ScenarioConfig: configuration object to generate scenarios.
- ScenarioModel: contains the scenario data.
- MarketData: object containing annual stock returns, bond yields, and inflation.
### Interfaces
- generate_scenario(ScenarioConfig) -> ScenarioModel
- ScenarioModel.get_market_data() -> Iterator[MarketData]

## Strategy Engine
### Responsibilities
Define withdrawal strategy according to market returns. Update portfolio values with market returns/withdrawals.
Diffent strategies could be a fixed SWR or a dynamic strategy.
### Data Models
- StrategyConfig: Configuration object for strategies. Determines the strategy to use and all its parameters.
- StrategyResult: contains data about the outcome of executing the strategy (how much available income, changes made, etc)
### Interfaces
- execute_strategy(PortfolioState, MarketData) -> StrategyResult. Also overwrites PortfolioState with the new state.

## Tax Engine
### Responsibilities
Calculate capital gains and wealth taxes from gross income and portfolio value. Should support spanish regions.
### Data Models
- TaxConfig: configuration containing tax information.
- TaxResult: data object containing tax result information (gross amount, income tax, wealth tax, net amount, effective rate).
### Interfaces
- calculate_tax(gross_income, wealth) -> TaxResult
- calculate_reverse_tax(net_income, wealth) -> TaxResult: given a net income and wealth, calculate the gross income required.

## Report Engine
### Responsibilties
Generate simulation reports with detailed information about achieved goals and year-by-year breakdows.
### Data Models
- ReportConfig: configuration for reports.
- SimulationReport: data object containing the report
## Interfaces
- SimulationReport.to_txt()
- SimulationReport.to_csv()
- SimulationReport.save(db_connector)

## Input Validator
### Responsibilites
Collect user input, validate, and produce a valid SimulationConfig.

## API
### Responsibilities
Expose API for user-interface.