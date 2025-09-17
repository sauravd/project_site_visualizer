from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError
import re  # needed for MapLayer.clean()


# ---- Settings & Layers ----

class AppSettings(models.Model):
    # Bilingual title/footer
    title_en = models.CharField(max_length=200, default="Sites Map")
    title_ar = models.CharField(max_length=200, blank=True, null=True)

    footer_text_en = models.CharField(max_length=300, blank=True, default="")
    footer_text_ar = models.CharField(max_length=300, blank=True, null=True)

    # Logos per language
    logo_left_en  = models.ImageField(upload_to="branding/", blank=True, null=True)
    logo_left_ar  = models.ImageField(upload_to="branding/", blank=True, null=True)
    logo_right_en = models.ImageField(upload_to="branding/", blank=True, null=True)
    logo_right_ar = models.ImageField(upload_to="branding/", blank=True, null=True)

    # Favicon (served in <head>)
    favicon = models.ImageField(upload_to="branding/", blank=True, null=True)

    # Colors
    header_bg = models.CharField(max_length=20, default="#02466b")
    footer_bg = models.CharField(max_length=20, default="#02466b")

    # Map defaults (no hard clamp; global)
    default_center_lat = models.FloatField(default=23.8859)
    default_center_lon = models.FloatField(default=45.0792)
    default_zoom = models.PositiveSmallIntegerField(
        default=6, validators=[MinValueValidator(1), MaxValueValidator(19)]
    )

    # Built-in filter toggles
    show_filter_region = models.BooleanField(default=True)
    show_filter_governorate = models.BooleanField(default=True)
    show_filter_crop_type = models.BooleanField(default=True)
    show_filter_water_source = models.BooleanField(default=True)
    show_filter_irrigation_type = models.BooleanField(default=True)
    show_filter_trees = models.BooleanField(default=True)
    show_filter_area = models.BooleanField(default=True)

    # Default interface language
    default_language = models.CharField(
        max_length=10,
        choices=[("en", "English"), ("ar", "العربية")],
        default="en",
    )

    def __str__(self):
        return f"App Settings ({self.pk})"


class MapLayer(models.Model):
    settings = models.ForeignKey(
        AppSettings, related_name="layers", on_delete=models.CASCADE
    )
    slug = models.SlugField(unique=True)
    name_en = models.CharField(max_length=120)
    name_ar = models.CharField(max_length=120, blank=True, null=True)

    # CharField so Leaflet templates like {s}/{z}/{x}/{y} pass validation
    url_template = models.CharField(
        max_length=512,
        help_text="Leaflet tile URL template, e.g. https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    )

    is_default = models.BooleanField(default=False)
    min_zoom = models.PositiveSmallIntegerField(default=0)
    max_zoom = models.PositiveSmallIntegerField(default=19)
    attribution = models.CharField(max_length=300, blank=True, default="")
    subdomains = models.CharField(
        max_length=50, blank=True, default="", help_text="e.g. 'abc' or 'abcd'"
    )
    active = models.BooleanField(default=True)

    class Meta:
        unique_together = [("settings", "slug")]

    def __str__(self):
        return f"{self.slug} ({'default' if self.is_default else 'layer'})"

    def clean(self):
        # Lightweight validation: must be http(s) and include z/x/y tokens
        if not re.match(r"^https?://", (self.url_template or "")):
            raise ValidationError({"url_template": "Must start with http:// or https://"})
        for token in ("{z}", "{x}", "{y}"):
            if token not in (self.url_template or ""):
                raise ValidationError({"url_template": f"Missing {token} token"})

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Ensure only one default per *this settings* group
        if self.is_default:
            MapLayer.objects.filter(settings=self.settings).exclude(pk=self.pk).update(is_default=False)


# ---- Sites & Media ----

class Site(models.Model):
    code = models.PositiveIntegerField(blank=True, null=True, unique=True)  # optional numeric code

    # Core (EN) + Arabic counterparts
    farmer_name = models.CharField(max_length=200, blank=True, default="")
    farmer_name_ar = models.CharField(max_length=200, blank=True, null=True)

    region = models.CharField(max_length=200, blank=True, default="")
    region_ar = models.CharField(max_length=200, blank=True, null=True)

    governorate = models.CharField(max_length=200, blank=True, default="")
    governorate_ar = models.CharField(max_length=200, blank=True, null=True)

    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)

    crop_type = models.CharField(max_length=200, blank=True, default="")
    crop_type_ar = models.CharField(max_length=200, blank=True, null=True)

    water_source = models.CharField(max_length=200, blank=True, default="")
    water_source_ar = models.CharField(max_length=200, blank=True, null=True)

    irrigation_system_type = models.CharField(max_length=200, blank=True, default="")
    irrigation_system_type_ar = models.CharField(max_length=200, blank=True, null=True)

    distribution_uniformity_pct = models.DecimalField(
        max_digits=5, decimal_places=2, blank=True, null=True
    )

    number_of_trees = models.CharField(max_length=120, blank=True, null=True, help_text="Accepts numbers or free text, e.g., One Greenhouse")
    area_m2 = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)

    description = models.TextField(blank=True, default="")
    description_ar = models.TextField(blank=True, null=True)

    # Optional design PDF
    design_pdf = models.FileField(upload_to="designs/", blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["pk"]

    def __str__(self):
        return f"{self.code or self.pk} - {self.farmer_name or 'Site'}"


class SiteImage(models.Model):
    site = models.ForeignKey(Site, related_name="images", on_delete=models.CASCADE)
    image = models.ImageField(upload_to="photos/")
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "pk"]

    def __str__(self):
        return f"Image #{self.pk} for {self.site_id}"


# ---- Custom fields to make popups reusable for other scenarios ----

class CustomField(models.Model):
    TEXT = "text"
    NUMBER = "number"
    CHOICE = "choice"
    FIELD_TYPES = [(TEXT, "Text"), (NUMBER, "Number"), (CHOICE, "Choice")]

    key = models.SlugField(unique=True, help_text="machine key (e.g. energy_source)")
    label_en = models.CharField(max_length=200)
    label_ar = models.CharField(max_length=200, blank=True, null=True)
    field_type = models.CharField(max_length=10, choices=FIELD_TYPES, default=TEXT)
    is_filterable = models.BooleanField(default=False)  # show as dropdown filter
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.key


class SiteExtra(models.Model):
    site = models.ForeignKey(Site, related_name="extras", on_delete=models.CASCADE)
    field = models.ForeignKey(CustomField, on_delete=models.CASCADE)
    value_en = models.CharField(max_length=500, blank=True, default="")
    value_ar = models.CharField(max_length=500, blank=True, null=True)

    class Meta:
        unique_together = [("site", "field")]

    def __str__(self):
        return f"{self.site_id}::{self.field.key}"
