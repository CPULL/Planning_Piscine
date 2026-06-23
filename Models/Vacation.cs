namespace PlanningPiscine.Models;

public class Vacation {
  public int Id { get; set; }
  public string Name { get; set; } = string.Empty;
  public int? TherapistId { get; set; }
  public bool IsYearIndependent { get; set; } = false;
  public int? Month { get; set; }
  public int? Day { get; set; }
  public DateOnly? StartDate { get; set; }
  public DateOnly? EndDate { get; set; }

  public User? Therapist { get; set; }
}
