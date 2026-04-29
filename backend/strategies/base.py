"""BaseStrategy — abstract base class every strategy inherits from.

The contract is intentionally narrow: a strategy converts a DataFrame of bars
into a Series of target positions in ``{-1, 0, 1}``. Everything else
(position sizing, fills, slippage, commissions, equity tracking) is the
engine's responsibility — strategies don't see them.

Why this separation? It makes strategies trivially unit-testable (input
fixture → expected signals) and prevents subtle look-ahead-bias bugs that
arise when strategies try to "execute" their own trades.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, ClassVar

import pandas as pd
from pydantic import BaseModel, ConfigDict


class StrategyConfig(BaseModel):
    """Runtime parameters for a strategy.

    Each concrete strategy defines its own subclass with typed fields so
    Pydantic does the validation. The ``params_schema`` exposed via the API
    is the JSON Schema dump of that subclass.
    """

    model_config = ConfigDict(extra="forbid")


class BaseStrategy(ABC):
    """Abstract trading strategy.

    Class attributes
    ----------------
    slug
        Short lowercase identifier — also the public API id.
    name
        Human-readable name.
    description
        One-paragraph explanation. Surfaced in the UI strategy library.
    config_cls
        Pydantic model defining the strategy's parameters.

    Lifecycle
    ---------
    >>> cfg = MyStrategy.config_cls(fast=10, slow=30)
    >>> strat = MyStrategy(cfg)
    >>> signals = strat.generate_signals(bars)
    """

    slug: ClassVar[str] = ""
    name: ClassVar[str] = ""
    description: ClassVar[str] = ""
    config_cls: ClassVar[type[StrategyConfig]]

    def __init__(self, config: StrategyConfig | None = None) -> None:
        if config is None:
            config = self.config_cls()
        if not isinstance(config, self.config_cls):
            # Allow dict input for ergonomics — validate via the Pydantic model.
            config = self.config_cls.model_validate(config)
        self.config: StrategyConfig = config

    # ------------------------------------------------------------------------
    # Required override
    # ------------------------------------------------------------------------
    @abstractmethod
    def generate_signals(self, bars: pd.DataFrame) -> pd.Series:
        """Produce a Series of target positions.

        Parameters
        ----------
        bars
            DataFrame indexed by tz-naive UTC ``DatetimeIndex`` with columns
            ``open, high, low, close, volume``. Sorted ascending by time.

        Returns
        -------
        pd.Series of int
            Aligned to ``bars.index``. Values in ``{-1, 0, 1}``:
            ``1`` = target long, ``0`` = flat, ``-1`` = target short.

        Notes
        -----
        * The signal at ``bars.index[t]`` is computed using **only** data up
          to and including ``bars.iloc[t]``. The engine enforces the t→t+1
          fill rule, so strategies don't need to "shift" their signals.
        """

    # ------------------------------------------------------------------------
    # Convenience: JSON-Schema for the UI's parameter form
    # ------------------------------------------------------------------------
    @classmethod
    def params_schema(cls) -> dict[str, Any]:
        """Return the JSON Schema for this strategy's parameters.

        Used by the Strategy Agent / API to populate ``strategies.params_schema``
        in the database, which the frontend then renders into a form.
        """
        return cls.config_cls.model_json_schema()
