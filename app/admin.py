from django.contrib import admin
from .models import AppSettings, MapLayer, Site, SiteImage, CustomField, SiteExtra

class MapLayerInline(admin.TabularInline):
    model = MapLayer
    extra = 0

@admin.register(AppSettings)
class AppSettingsAdmin(admin.ModelAdmin):
    inlines = [MapLayerInline]
    list_display = ("id", "title_en", "default_language")
    fieldsets = (
        ("Branding", {
            "fields": (("title_en","title_ar"),
                       ("footer_text_en","footer_text_ar"),
                       ("logo_left_en","logo_left_ar"),
                       ("logo_right_en","logo_right_ar"),
                       "favicon",
                       ("header_bg","footer_bg"),
                       "default_language")
        }),
        ("Map Defaults", {
            "fields": (("default_center_lat","default_center_lon","default_zoom"),)
        }),
        ("Filters", {
            "fields": ("show_filter_region","show_filter_governorate",
                       "show_filter_crop_type","show_filter_water_source",
                       "show_filter_irrigation_type", "show_filter_trees", "show_filter_area")
        }),
    )

class SiteImageInline(admin.TabularInline):
    model = SiteImage
    extra = 1

class SiteExtraInline(admin.TabularInline):
    model = SiteExtra
    extra = 0
    autocomplete_fields = ['field']

@admin.register(Site)
class SiteAdmin(admin.ModelAdmin):
    list_display = ("id","code","farmer_name","region","governorate","latitude","longitude")
    list_filter  = ("region","governorate","crop_type","water_source","irrigation_system_type")
    search_fields = ("code","farmer_name","region","governorate","description")
    inlines = [SiteImageInline, SiteExtraInline]
    fieldsets = (
        ("Identity", {
            "fields": (("code",),
                       ("farmer_name","farmer_name_ar"),
                       ("region","region_ar"),
                       ("governorate","governorate_ar"))
        }),
        ("Location", {
            "fields": (("latitude","longitude"),)
        }),
        ("Agronomy", {
            "fields": (("crop_type","crop_type_ar"),
                       ("water_source","water_source_ar"),
                       ("irrigation_system_type","irrigation_system_type_ar"),
                       ("distribution_uniformity_pct","number_of_trees","area_m2"))
        }),
        ("Description", {
            "fields": (("description","description_ar"), "design_pdf")
        }),
    )

@admin.register(CustomField)
class CustomFieldAdmin(admin.ModelAdmin):
    list_display = ("key","label_en","field_type","is_filterable","active")
    list_filter  = ("field_type","is_filterable","active")
    search_fields = ("key","label_en","label_ar")
