using Microsoft.EntityFrameworkCore;
using PlanningPiscine.Models;

namespace PlanningPiscine.Data;

public class AppDbContext : DbContext {
  public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

  public DbSet<User> Users { get; set; }
  public DbSet<Patient> Patients { get; set; }
  public DbSet<TherapistAvailability> TherapistAvailabilities { get; set; }
  public DbSet<PaymentType> PaymentTypes { get; set; }
  public DbSet<PrescriptionPdf> PrescriptionPdfs { get; set; }
  public DbSet<Therapy> Therapies { get; set; }
  public DbSet<Structure> Structures { get; set; }
  public DbSet<Group> Groups { get; set; }
  public DbSet<GroupTherapy> GroupTherapies { get; set; }
  public DbSet<PlannedSlot> PlannedSlots { get; set; }
  public DbSet<Vacation> Vacations { get; set; }
  public DbSet<Alert> Alerts { get; set; }

  protected override void OnModelCreating(ModelBuilder modelBuilder) {
    base.OnModelCreating(modelBuilder);

    modelBuilder.Entity<PaymentType>().HasData(
      new PaymentType { Id = 1, Name = "Convenzione", Type = 0 },
      new PaymentType { Id = 2, Name = "Privato",     Type = 0 },
      new PaymentType { Id = 3, Name = "INAIL",       Type = 0 }
    );

    modelBuilder.Entity<Structure>().HasData(
      new Structure { Id = 1, Name = "Ponti Rossi" },
      new Structure { Id = 2, Name = "Porcellane"  }
    );

		modelBuilder.Entity<Alert>()
	    .HasOne(a => a.User)
	    .WithMany()
	    .HasForeignKey(a => a.UserId)
	    .OnDelete(DeleteBehavior.SetNull);

		modelBuilder.Entity<Alert>()
			.HasOne(a => a.Therapy)
			.WithMany()
			.HasForeignKey(a => a.TherapyId)
			.OnDelete(DeleteBehavior.SetNull);

		modelBuilder.Entity<Alert>()
			.HasOne(a => a.Patient)
			.WithMany()
			.HasForeignKey(a => a.PatientId)
			.OnDelete(DeleteBehavior.SetNull);
	}
}
