"""Domain-specific exceptions for consistent error handling."""


class LspSimulatorError(Exception):
    """Base exception for recoverable domain errors."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class ImportValidationError(LspSimulatorError):
    """Raised when CSV import validation fails."""

    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=422)


class TopologyNotLoadedError(LspSimulatorError):
    """Raised when compute/export is requested before import."""

    def __init__(self) -> None:
        super().__init__(
            "No topology loaded. Import nes.csv and links.csv first.",
            status_code=409,
        )


class PathComputationError(LspSimulatorError):
    """Raised when source/destination are invalid or unreachable."""

    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=400)
