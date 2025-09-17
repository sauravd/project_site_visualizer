from django.shortcuts import render
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.renderers import JSONRenderer
from .models import AppSettings, Site, MapLayer  # MapLayer used for type discovery
from .serializers import AppSettingsSerializer, SiteGeoJSONSerializer


def home(request):
    """
    Render shell; initial HTML lang comes from AppSettings.default_language,
    but actual active language is handled by Django i18n middleware.
    """
    app = AppSettings.objects.order_by("-pk").first()
    lang = getattr(app, "default_language", None) or "en"
    return render(request, "app/index.html", {"default_lang": lang})


def _layers_accessor_name():
    """
    Discover the reverse accessor name on AppSettings that points to MapLayer.
    """
    for f in AppSettings._meta.get_fields():
        if getattr(f, "auto_created", False) and f.is_relation and f.one_to_many:
            if getattr(f, "related_model", None) is MapLayer:
                return f.get_accessor_name()
    return None


class ConfigView(APIView):
    authentication_classes = []
    permission_classes = []
    renderer_classes = [JSONRenderer]

    def get(self, request):
        qs = AppSettings.objects.order_by("-pk")
        acc = _layers_accessor_name()
        # Only prefetch if we actually found the correct accessor name
        if acc:
            qs = qs.prefetch_related(acc)

        app = qs.first()
        if not app:
            # Minimal sane defaults until an AppSettings row exists
            return Response({
                "title_en": "Sites Map", "title_ar": None,
                "footer_text_en": "", "footer_text_ar": "",
                "title": None, "footer_text": None,
                "header_bg": "#02466b", "footer_bg": "#02466b",
                "default_center_lat": 23.8859, "default_center_lon": 45.0792, "default_zoom": 6,
                "show_filter_region": True, "show_filter_governorate": True,
                "show_filter_crop_type": True, "show_filter_water_source": True,
                "show_filter_irrigation_type": True, "show_filter_trees": True, "show_filter_area":True, 
                "default_language": "en",
                "logo_left_en": None, "logo_left_ar": None,
                "logo_right_en": None, "logo_right_ar": None,
                "logo_left": None, "logo_right": None,
                "favicon": None,
                "layers": [{
                    "slug": "osm",
                    "name_en": "OpenStreetMap",
                    "name_ar": "OpenStreetMap",
                    "url_template": "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                    "is_default": True,
                    "min_zoom": 0, "max_zoom": 19,
                    "attribution": "© OpenStreetMap contributors",
                    "subdomains": "abc",
                    "active": True,
                }],
            })

        ser = AppSettingsSerializer(app, context={"request": request})
        return Response(ser.data)


class SitesGeoJSON(APIView):
    authentication_classes = []
    permission_classes = []
    renderer_classes = [JSONRenderer]

    def get(self, request):
        qs = (
            Site.objects
            .exclude(latitude__isnull=True)
            .exclude(longitude__isnull=True)
            .prefetch_related("images", "extras__field")
            .order_by("pk")
        )
        ser = SiteGeoJSONSerializer(qs, many=True, context={"request": request})
        return Response({"type": "FeatureCollection", "features": ser.data})

class SitePDFEmbed(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request, pk):
        site = get_object_or_404(Site, pk=pk)
        if not site.design_pdf:
            raise Http404()
        resp = FileResponse(site.design_pdf.open('rb'), content_type='application/pdf')
        # allow embedding on same origin so our lightbox <iframe> works
        resp['X-Frame-Options'] = 'SAMEORIGIN'
        return resp
