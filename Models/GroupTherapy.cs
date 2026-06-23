namespace PlanningPiscine.Models;

public class GroupTherapy {
  public int Id { get; set; }
  public int GroupId { get; set; }
  public int TherapyId { get; set; }

  public Group? Group { get; set; }
  public Therapy? Therapy { get; set; }
}
