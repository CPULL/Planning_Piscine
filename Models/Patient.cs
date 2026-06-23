namespace PlanningPiscine.Models;

public class Patient {
  public int Id { get; set; }
  public string FullName { get; set; } = string.Empty;
  public string CodiceFiscale { get; set; } = string.Empty;
  public string Sesso { get; set; } = string.Empty;
  public string Telefono { get; set; } = string.Empty;
  public string PreferenzaOrario { get; set; } = string.Empty;
  public bool InGruppo { get; set; } = false;
  public DateTime DataInserimento { get; set; } = DateTime.Now;
  public int? PreferredStructureId { get; set; }
}
