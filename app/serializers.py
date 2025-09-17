from rest_framework import serializers
from .models import Site, SiteImage, AppSettings, MapLayer
from django.urls import reverse 


# ---------- Sites (GeoJSON) ----------

class SiteImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteImage
        fields = ["image", "sort_order"]


class SiteGeoJSONSerializer(serializers.ModelSerializer):
    images = SiteImageSerializer(many=True, read_only=True)
    design_pdf = serializers.SerializerMethodField()
    design_pdf_embed = serializers.SerializerMethodField() 
    extras = serializers.SerializerMethodField()

    class Meta:
        model = Site
        fields = [
            "id", "code",
            "farmer_name", "farmer_name_ar",
            "region", "region_ar",
            "governorate", "governorate_ar",
            "crop_type", "crop_type_ar",
            "water_source", "water_source_ar",
            "irrigation_system_type", "irrigation_system_type_ar",
            "distribution_uniformity_pct",
            "number_of_trees", "area_m2",
            "description", "description_ar",
            "latitude", "longitude",
            "images", "design_pdf","design_pdf_embed", "extras",
        ]

    # helpers
    def _abs(self, request, url_or_field):
        if not url_or_field:
            return None
        url = getattr(url_or_field, "url", None) or str(url_or_field)
        return request.build_absolute_uri(url) if request else url

    def get_design_pdf(self, obj):
        return self._abs(self.context.get("request"), getattr(obj, "design_pdf", None))
    
    def get_design_pdf_embed(self, obj):
        url = reverse("site-pdf", args=[obj.pk])
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url
    

    def get_extras(self, obj):
        # assume prefetch extras__field
        out = []
        for ev in obj.extras.select_related("field").all():
            out.append({
                "key": ev.field.key,
                "label_en": ev.field.label_en,
                "label_ar": ev.field.label_ar,
                "value_en": ev.value_en,
                "value_ar": ev.value_ar,
                "is_filterable": ev.field.is_filterable,
            })
        return out

    def to_representation(self, instance):
        props = super().to_representation(instance)

        # absolutize image URLs
        request = self.context.get("request")
        for img in props.get("images", []):
            if img.get("image"):
                img["image"] = self._abs(request, img["image"])

        lon = float(props.pop("longitude"))
        lat = float(props.pop("latitude"))
        return {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": props,
        }


# ---------- Settings / Layers ----------

class _AbsURLMixin:
    def _abs(self, request, f):
        if not f:
            return None
        url = getattr(f, "url", None) or str(f)
        return request.build_absolute_uri(url) if request else url


class MapLayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = MapLayer
        fields = [
            "slug", "name_en", "name_ar",
            "url_template", "is_default",
            "min_zoom", "max_zoom",
            "attribution", "subdomains",
            "active",
        ]


class AppSettingsSerializer(_AbsURLMixin, serializers.ModelSerializer):
    # Media (absolute URLs)
    logo_left_en  = serializers.SerializerMethodField()
    logo_left_ar  = serializers.SerializerMethodField()
    logo_right_en = serializers.SerializerMethodField()
    logo_right_ar = serializers.SerializerMethodField()
    logo_left     = serializers.SerializerMethodField()   # single fallback
    logo_right    = serializers.SerializerMethodField()   # single fallback
    favicon       = serializers.SerializerMethodField()

    # Text fallbacks if you also keep single fields
    title        = serializers.SerializerMethodField()
    footer_text  = serializers.SerializerMethodField()

    # Layers discovered dynamically (don’t assume related_name)
    layers       = serializers.SerializerMethodField()

    class Meta:
        model = AppSettings
        fields = [
            # multilingual fields your model already has
            "title_en", "title_ar",
            "footer_text_en", "footer_text_ar",

            # optional single-field fallbacks (provided via method fields)
            "title", "footer_text",

            # chrome
            "header_bg", "footer_bg",
            "default_center_lat", "default_center_lon", "default_zoom",

            # which built-in filters to show
            "show_filter_region", "show_filter_governorate",
            "show_filter_crop_type", "show_filter_water_source",
            "show_filter_irrigation_type",

            # language
            "default_language",

            "show_filter_trees", "show_filter_area", 

            # media (both multilingual and single)
            "logo_left_en", "logo_left_ar",
            "logo_right_en", "logo_right_ar",
            "logo_left", "logo_right",
            "favicon",

            # layers
            "layers",
        ]

    # ----- dynamic reverse accessor discovery -----
    def _layers_accessor(self, obj):
        """
        Find the reverse accessor on AppSettings that points to MapLayer
        (e.g. 'layers', 'map_layers', or default 'maplayer_set').
        """
        model = obj.__class__
        for f in model._meta.get_fields():
            if getattr(f, "auto_created", False) and f.is_relation and f.one_to_many:
                if getattr(f, "related_model", None) is MapLayer:
                    return f.get_accessor_name()
        return None

    # ----- getters -----
    def get_layers(self, obj):
        acc = self._layers_accessor(obj)
        qs = getattr(obj, acc).all() if acc and hasattr(obj, acc) else MapLayer.objects.none()
        return MapLayerSerializer(qs, many=True).data

    def get_logo_left_en(self, obj):
        # fallback to single if multilingual empty
        return self._abs(self.context.get("request"),
                         getattr(obj, "logo_left_en", None) or getattr(obj, "logo_left", None))

    def get_logo_left_ar(self, obj):
        return self._abs(self.context.get("request"),
                         getattr(obj, "logo_left_ar", None) or getattr(obj, "logo_left", None))

    def get_logo_right_en(self, obj):
        return self._abs(self.context.get("request"),
                         getattr(obj, "logo_right_en", None) or getattr(obj, "logo_right", None))

    def get_logo_right_ar(self, obj):
        return self._abs(self.context.get("request"),
                         getattr(obj, "logo_right_ar", None) or getattr(obj, "logo_right", None))

    def get_logo_left(self, obj):
        return self._abs(self.context.get("request"), getattr(obj, "logo_left", None))

    def get_logo_right(self, obj):
        return self._abs(self.context.get("request"), getattr(obj, "logo_right", None))

    def get_favicon(self, obj):
        return self._abs(self.context.get("request"), getattr(obj, "favicon", None))

    def get_title(self, obj):
        # optional single field
        return getattr(obj, "title", None)

    def get_footer_text(self, obj):
        return getattr(obj, "footer_text", None)
