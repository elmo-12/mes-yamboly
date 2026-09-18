"""Modelos Pydantic del contrato (`docs/prediccion-python.md`). `extra='ignore'`
en las requests, como exige el §2: los campos extra se ignoran, no se
rechazan."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ContextoPrediccion(BaseModel):
    """`PredictionContext` tal cual (`prediction.provider.ts:7-29`)."""

    model_config = ConfigDict(extra="ignore")

    tipo: str
    lineaId: str
    lineaCodigo: str
    turno: str
    eventos7d: float = 0
    eventos30d: float = 0
    desvioVelocidadPct: float = 0
    oeeActual: float = 0
    minutosDesdeCambio: float = 0
    features: dict[str, float] | None = None


class Factor(BaseModel):
    texto: str
    contribucion: int


class RespuestaPredict(BaseModel):
    probabilidad: float
    factores: list[Factor]
    version: str
    proveedor: str = "python-gbm"
    latenciaMs: float


class SnapshotInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    sha256: str
    filas: int
    desde: str
    hasta: str


class CatalogoItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    nombre: str
    grupo: str
    etiqueta: str


class PliegueInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    entrenamientoHasta: str
    validacionDesde: str
    validacionHasta: str


class EvaluacionInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    pruebaDesde: str
    pliegues: list[PliegueInfo] = Field(default_factory=list)


class MuestraEntrenamiento(BaseModel):
    model_config = ConfigDict(extra="ignore")

    lineaId: str
    lineaCodigo: str
    fecha: str
    turno: str
    modo: Literal["anticipado", "retro"]
    inicioTurno: str | None = None
    features: dict[str, float] = Field(default_factory=dict)
    huboParadaImprevista: int | None = None
    mermaSobreEstandar: int | None = None
    minutosImprevistos: float | None = None
    tipoCausaDominante: str | None = None


class CampeonInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    version: str
    algoritmo: str
    hiperparametros: dict[str, Any] = Field(default_factory=dict)


class EntrenarRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    version: str
    objetivos: list[str]
    snapshot: SnapshotInfo
    catalogo: list[CatalogoItem]
    prohibidas: list[str] = Field(default_factory=list)
    evaluacion: EvaluacionInfo
    muestras: list[MuestraEntrenamiento]
    campeon: CampeonInfo | None = None
    semilla: int = 42


class RespuestaEntrenar(BaseModel):
    runId: str
    resultados: dict[str, Any]
    duracionMs: float


class RespuestaSalud(BaseModel):
    estado: Literal["ok", "degradado"]
    modeloCargado: bool
    version: str | None = None
    sklearn: str
    uptimeS: float


class RespuestaModeloActual(BaseModel):
    version: str
    objetivo: str
    algoritmo: str
    hiperparametros: dict[str, Any]
    nombres: list[str]
    entrenadoEn: str
    artefactoSha256: str
    umbralDecisionPct: float
